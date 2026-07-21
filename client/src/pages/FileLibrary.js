import { useCallback, useEffect, useMemo, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import ShareFileModal from "../components/ShareFileModal";
import FileThumbnail from "../components/FileThumbnail";
import {
    getApiUrl,
    formatFileSize,
    formatUploadDate,
} from "../utils/api";
import { ACCESS_MODES, canShareFile } from "../utils/accessModes";
import {
    STORAGE_FILTERS,
    getStorageScopeLabel,
    matchesStorageFilter,
    resolveStorageScope,
} from "../utils/fileStorageScope";
import { getApiMode } from "../utils/apiDiscovery";
import {
    fetchMergedLibrarySnapshot,
    fileApiFetch,
} from "../utils/mergedLibrary";

function isLocalApiMode() {
    const mode = getApiMode();
    return mode === "local" || mode === "manual";
}

function mergeServerFileIntoTagged(existing, serverFile) {
    return {
        ...existing,
        ...serverFile,
        apiSource: existing.apiSource,
        sourceId: serverFile.id ?? existing.sourceId,
        id: existing.id,
    };
}

function FileLibrary({ onRedirectToLogin, onGoToUpload }) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [selectedFileId, setSelectedFileId] = useState(null);
    const [shareFile, setShareFile] = useState(null);
    const [updatingModeId, setUpdatingModeId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [syncNote, setSyncNote] = useState("");
    const [linkBanner, setLinkBanner] = useState("");
    const [storageFilter, setStorageFilter] = useState("all");
    const [preferLocalLabels, setPreferLocalLabels] = useState(false);

    const activeFiles = useMemo(
        () => files.filter((file) => !file.deleted),
        [files]
    );
    const filteredActiveFiles = useMemo(
        () =>
            activeFiles.filter((file) =>
                matchesStorageFilter(file, storageFilter, {
                    preferLocal: preferLocalLabels,
                })
            ),
        [activeFiles, storageFilter, preferLocalLabels]
    );
    const deletedFiles = useMemo(
        () => files.filter((file) => file.deleted),
        [files]
    );
    const selectedFile = useMemo(
        () => files.find((file) => file.id === selectedFileId) || null,
        [files, selectedFileId]
    );

    const applySnapshot = useCallback((snapshot, { refreshLabel = false } = {}) => {
        setFiles(snapshot.files);
        const linkMsg =
            !snapshot.linkStatus?.linked && snapshot.linkStatus?.message
                ? snapshot.linkStatus.message
                : "";
        setLinkBanner(linkMsg);

        let note = snapshot.note || "";
        if (refreshLabel && !note) {
            note = "Library refreshed";
        }
        setSyncNote(note);
    }, []);

    const fetchLibrarySnapshot = useCallback(async () => {
        try {
            return await fetchMergedLibrarySnapshot();
        } catch (err) {
            if (err.status === 401) {
                onRedirectToLogin();
                return null;
            }
            throw err;
        }
    }, [onRedirectToLogin]);

    useEffect(() => {
        let cancelled = false;

        const loadOnEnter = async () => {
            setLoading(true);
            setError("");
            setSyncNote("");
            setLinkBanner("");

            try {
                const snapshot = await fetchLibrarySnapshot();
                if (cancelled || !snapshot) {
                    return;
                }
                applySnapshot(snapshot);
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err.message ||
                            "Could not reach server. Is the backend running?"
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadOnEnter();
        return () => {
            cancelled = true;
        };
    }, [fetchLibrarySnapshot, applySnapshot]);

    useEffect(() => {
        let cancelled = false;
        const onLocalApi = isLocalApiMode();
        if (!onLocalApi) {
            setPreferLocalLabels(false);
            return undefined;
        }

        fetch(`${getApiUrl()}/health`, { cache: "no-store" })
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) {
                    return;
                }
                const localDisk =
                    data.storageScope === "local" ||
                    data.storageMode === "disk" ||
                    Boolean(data.folderShare);
                setPreferLocalLabels(localDisk);
            })
            .catch(() => {
                if (!cancelled) {
                    setPreferLocalLabels(onLocalApi);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selectedFileId) {
            return undefined;
        }

        const onKeyDown = (event) => {
            if (event.key === "Escape" && !shareFile) {
                setSelectedFileId(null);
            }
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [selectedFileId, shareFile]);

    const handleRefresh = async () => {
        setRefreshing(true);
        setError("");
        setSyncNote("");

        try {
            const snapshot = await fetchLibrarySnapshot();
            if (!snapshot) {
                return;
            }
            applySnapshot(snapshot, { refreshLabel: true });
        } catch (err) {
            setError(
                err.message || "Could not refresh. Is the server running?"
            );
        } finally {
            setRefreshing(false);
        }
    };

    const loadFiles = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const snapshot = await fetchLibrarySnapshot();
            if (snapshot) {
                applySnapshot(snapshot);
            }
        } catch (err) {
            setError(
                err.message || "Could not reach server. Is the backend running?"
            );
        } finally {
            setLoading(false);
        }
    }, [fetchLibrarySnapshot, applySnapshot]);

    const handleDelete = async (file) => {
        if (
            !window.confirm(
                `Delete "${file.filename}"? The file will be removed, but a log entry will stay in the library.`
            )
        ) {
            return;
        }

        setDeletingId(file.id);
        setError("");

        try {
            const res = await fileApiFetch(file, "", { method: "DELETE" });

            if (res.status === 401) {
                onRedirectToLogin();
                return;
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.message || "Could not delete file");
                return;
            }

            setSelectedFileId(null);
            await loadFiles();
        } catch {
            setError("Could not delete file");
        } finally {
            setDeletingId(null);
        }
    };

    const handleAccessModeChange = async (file, nextMode) => {
        setUpdatingModeId(file.id);
        setError("");

        try {
            const res = await fileApiFetch(file, "/access-mode", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ accessMode: nextMode }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || "Could not update access mode");
                return;
            }

            if (data.file) {
                setFiles((prev) =>
                    prev.map((entry) =>
                        entry.id === file.id
                            ? mergeServerFileIntoTagged(entry, data.file)
                            : entry
                    )
                );
            } else {
                await loadFiles();
            }
        } catch {
            setError("Could not update access mode");
        } finally {
            setUpdatingModeId(null);
        }
    };

    const handleDownload = async (file) => {
        try {
            const res = await fileApiFetch(file, "/download");

            if (res.status === 401) {
                onRedirectToLogin();
                return;
            }

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message || "Download failed");
                return;
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = file.filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            setError("Could not download file");
        }
    };

    const closeDetail = () => {
        if (!shareFile) {
            setSelectedFileId(null);
        }
    };

    return (
        <section className="dashboard-page dashboard-page--wide">
            <div className="dashboard-card files-page-card files-page-card--grid">
                <div className="files-section-header">
                    <h2 className="auth-title">File library</h2>
                    <div className="files-section-header-actions">
                        <button
                            type="button"
                            className="file-download-btn"
                            onClick={handleRefresh}
                            disabled={refreshing || loading}
                        >
                            {refreshing ? "Refreshing…" : "Refresh"}
                        </button>
                        <button type="button" className="logout-btn files-upload-nav-btn" onClick={onGoToUpload}>
                            Upload file
                        </button>
                    </div>
                </div>
                <p className="files-page-intro">
                    Click a file to change access, share, download, or delete. Deletion keeps a
                    history entry with who uploaded and who removed it.
                </p>

                <NetworkStatusIndicator compact />

                {!loading && linkBanner && (
                    <p className="library-link-banner" role="status">
                        {linkBanner}
                    </p>
                )}

                {!loading && !error && activeFiles.length > 0 && (
                    <div className="file-library-filters" role="group" aria-label="Filter by storage">
                        {STORAGE_FILTERS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={`file-library-filter-btn ${
                                    storageFilter === option.value
                                        ? "file-library-filter-btn--active"
                                        : ""
                                }`}
                                aria-pressed={storageFilter === option.value}
                                onClick={() => setStorageFilter(option.value)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                )}

                {loading && <p className="files-muted">Loading your files…</p>}
                {error && <p className="error">{error}</p>}
                {!error && syncNote && <p className="files-muted">{syncNote}</p>}

                {!loading && !error && activeFiles.length === 0 && deletedFiles.length === 0 && (
                    <p className="files-muted">
                        You have not uploaded any files yet.{" "}
                        <button type="button" className="files-link-btn" onClick={onGoToUpload}>
                            Upload your first file
                        </button>
                    </p>
                )}

                {!loading && !error && activeFiles.length > 0 && filteredActiveFiles.length === 0 && (
                    <p className="files-muted">
                        No {storageFilter === "cloud" ? "cloud" : "local"} files in your library.{" "}
                        <button
                            type="button"
                            className="files-link-btn"
                            onClick={() => setStorageFilter("all")}
                        >
                            Show all files
                        </button>
                    </p>
                )}

                {!loading && filteredActiveFiles.length > 0 && (
                    <div className="file-grid" role="list">
                        {filteredActiveFiles.map((file) => {
                            const scope = resolveStorageScope(file, {
                                preferLocal: preferLocalLabels,
                            });
                            return (
                            <button
                                key={file.id}
                                type="button"
                                role="listitem"
                                className="file-grid-tile"
                                onClick={() => setSelectedFileId(file.id)}
                            >
                                <span
                                    className={`file-grid-tile__storage-badge file-grid-tile__storage-badge--${
                                        scope === "local" ? "local" : "cloud"
                                    }`}
                                >
                                    {getStorageScopeLabel(scope)}
                                </span>
                                <FileThumbnail file={file} onAuthError={onRedirectToLogin} />
                                <span className="file-grid-tile__body">
                                    <span className="file-grid-tile__name" title={file.filename}>
                                        {file.filename}
                                    </span>
                                    <span className="file-grid-tile__meta">
                                        {file.uploadedBy || "Unknown"}
                                    </span>
                                    {(file.accessMode === "local_only" || file.share) && (
                                        <span className="file-grid-tile__badges">
                                            {file.accessMode === "local_only" && (
                                                <span className="file-list-access-badge file-list-access-badge--local">
                                                    LAN only
                                                </span>
                                            )}
                                            {file.share && (
                                                <span className="file-list-share-badge">Shared</span>
                                            )}
                                        </span>
                                    )}
                                </span>
                            </button>
                            );
                        })}
                    </div>
                )}

                {!loading && deletedFiles.length > 0 && (
                    <div className="file-deletion-log">
                        <h3 className="files-section-title">Deletion log</h3>
                        <p className="files-muted">
                            Files removed from storage. Click an entry for details.
                        </p>
                        <div className="file-grid file-grid--deleted" role="list">
                            {deletedFiles.map((file) => (
                                <button
                                    key={file.id}
                                    type="button"
                                    role="listitem"
                                    className="file-grid-tile file-grid-tile--deleted"
                                    onClick={() => setSelectedFileId(file.id)}
                                >
                                    <span className="file-grid-tile__body">
                                        <span className="file-grid-tile__name" title={file.filename}>
                                            {file.filename}
                                        </span>
                                        <span className="file-grid-tile__meta">
                                            Deleted by {file.deletedBy || "Unknown"}
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {selectedFile && (
                <div
                    className="modal-overlay file-detail-overlay"
                    onClick={closeDetail}
                    role="presentation"
                >
                    <div
                        className="modal-card file-detail-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="file-detail-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="file-detail-modal__header">
                            <h3 id="file-detail-title" className="modal-title">
                                {selectedFile.filename}
                            </h3>
                            <button
                                type="button"
                                className="files-link-btn"
                                onClick={() => setSelectedFileId(null)}
                            >
                                Close
                            </button>
                        </div>

                        {!selectedFile.deleted && (
                            <div className="file-detail-modal__preview">
                                <FileThumbnail
                                    file={selectedFile}
                                    onAuthError={onRedirectToLogin}
                                />
                            </div>
                        )}

                        <div className="file-detail-modal__meta">
                            {!selectedFile.deleted && (() => {
                                const scope = resolveStorageScope(selectedFile, {
                                    preferLocal: preferLocalLabels,
                                });
                                return (
                                <p>
                                    <span className="file-detail-label">Storage</span>
                                    <span
                                        className={`file-grid-tile__storage-badge file-grid-tile__storage-badge--${
                                            scope === "local" ? "local" : "cloud"
                                        } file-grid-tile__storage-badge--inline`}
                                    >
                                        {getStorageScopeLabel(scope)}
                                    </span>
                                </p>
                                );
                            })()}
                            {!selectedFile.deleted && (
                                <p>
                                    <span className="file-detail-label">Type / size</span>
                                    {selectedFile.fileType} ·{" "}
                                    {formatFileSize(selectedFile.fileSize)}
                                </p>
                            )}
                            <p>
                                <span className="file-detail-label">Uploaded by</span>
                                {selectedFile.uploadedBy || "Unknown"} ·{" "}
                                {formatUploadDate(selectedFile.uploadDate)}
                            </p>
                            {selectedFile.deleted && (
                                <p>
                                    <span className="file-detail-label">Deleted by</span>
                                    {selectedFile.deletedBy || "Unknown"} ·{" "}
                                    {formatUploadDate(selectedFile.deletedAt)}
                                </p>
                            )}
                        </div>

                        {selectedFile.deleted ? (
                            <p className="files-muted">
                                This file was removed from storage. The log entry is kept for
                                history.
                            </p>
                        ) : (
                            <>
                                <label className="file-access-mode-inline file-detail-access">
                                    <span className="file-access-mode-inline-label">Access mode</span>
                                    <select
                                        className="file-access-mode-select"
                                        value={selectedFile.accessMode || "private"}
                                        disabled={updatingModeId === selectedFile.id}
                                        onChange={(e) =>
                                            handleAccessModeChange(
                                                selectedFile,
                                                e.target.value
                                            )
                                        }
                                    >
                                        {ACCESS_MODES.map((mode) => (
                                            <option key={mode.value} value={mode.value}>
                                                {mode.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                {selectedFile.accessMode === "local_only" && (
                                    <p className="files-muted file-detail-local-only-note">
                                        Local Only range:{" "}
                                        {selectedFile.localOnlyCidr ||
                                            "not set yet — switch to Local Only again on the intended Wi‑Fi"}
                                    </p>
                                )}

                                <div className="file-list-actions file-detail-actions">
                                    <button
                                        type="button"
                                        className="file-share-btn"
                                        onClick={() => setShareFile(selectedFile)}
                                        disabled={!canShareFile(selectedFile)}
                                        title={
                                            canShareFile(selectedFile)
                                                ? "Create a share link"
                                                : "Private files cannot be shared"
                                        }
                                    >
                                        Share
                                    </button>
                                    <button
                                        type="button"
                                        className="file-download-btn"
                                        onClick={() => handleDownload(selectedFile)}
                                    >
                                        Download
                                    </button>
                                    <button
                                        type="button"
                                        className="share-revoke-btn"
                                        onClick={() => handleDelete(selectedFile)}
                                        disabled={deletingId === selectedFile.id}
                                    >
                                        {deletingId === selectedFile.id
                                            ? "Deleting…"
                                            : "Delete"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {shareFile && (
                <ShareFileModal
                    file={shareFile}
                    onClose={() => setShareFile(null)}
                    onShareUpdated={async () => {
                        await loadFiles();
                    }}
                />
            )}
        </section>
    );
}

export default FileLibrary;
