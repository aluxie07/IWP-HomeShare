import { useCallback, useEffect, useMemo, useState } from "react";
import ShareFileModal from "../components/ShareFileModal";
import FileThumbnail from "../components/FileThumbnail";
import FileTextPreview from "../components/FileTextPreview";
import FileDocumentPreview from "../components/FileDocumentPreview";
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
import { isTextFile } from "../utils/textFilePreview";
import { isDocumentPreviewFile } from "../utils/documentPreview";

function isLocalApiMode() {
    const mode = getApiMode();
    return mode === "local" || mode === "manual";
}

function shortFileType(file) {
    const name = file?.filename || "";
    const dot = name.lastIndexOf(".");
    if (dot < 0) {
        return "FILE";
    }
    const ext = name.slice(dot + 1).toUpperCase();
    return ext.slice(0, 4) || "FILE";
}

function filterLabel(value) {
    if (value === "all") {
        return "All";
    }
    if (value === "cloud") {
        return "Cloud";
    }
    if (value === "local") {
        return "Local";
    }
    return value;
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

    const isEmptyLibrary =
        !loading && !error && activeFiles.length === 0 && deletedFiles.length === 0;

    return (
        <section className="dashboard-page dashboard-page--wide lib-page">
            <div className="lib-card">
                <div className="lib-header">
                    <div>
                        <h2 className="lib-title">File library</h2>
                        <p className="lib-intro">
                            Click any file to preview it, change who can see it, or send a share
                            link. Removed files stay listed below for a while, so nothing
                            disappears without a trace.
                        </p>
                    </div>
                    <div className="lib-header-actions">
                        <button
                            type="button"
                            className="lib-btn-ghost"
                            onClick={handleRefresh}
                            disabled={refreshing || loading}
                        >
                            {refreshing ? "Refreshing…" : "Refresh"}
                        </button>
                        <button
                            type="button"
                            className="lib-btn-upload-sm"
                            onClick={onGoToUpload}
                        >
                            Upload
                        </button>
                    </div>
                </div>

                {!loading && linkBanner && (
                    <div className="lib-link-banner" role="status">
                        <span>{linkBanner}</span>
                    </div>
                )}

                {loading && <p className="files-muted">Loading your files…</p>}
                {error && <p className="error">{error}</p>}
                {!error && syncNote && <p className="files-muted">{syncNote}</p>}

                {!loading && !error && activeFiles.length > 0 && (
                    <div className="lib-filters" role="group" aria-label="Filter by storage">
                        {STORAGE_FILTERS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={`lib-pill ${
                                    storageFilter === option.value ? "lib-pill--active" : ""
                                }`}
                                aria-pressed={storageFilter === option.value}
                                onClick={() => setStorageFilter(option.value)}
                            >
                                {filterLabel(option.value)}
                            </button>
                        ))}
                    </div>
                )}

                {!loading &&
                    !error &&
                    activeFiles.length > 0 &&
                    filteredActiveFiles.length === 0 && (
                        <p className="files-muted">
                            No {storageFilter === "cloud" ? "cloud" : "local"} files in your
                            library.{" "}
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
                    <div className="lib-grid" role="list">
                        {filteredActiveFiles.map((file) => {
                            const scope = resolveStorageScope(file, {
                                preferLocal: preferLocalLabels,
                            });
                            const scopeClass = scope === "local" ? "local" : "cloud";
                            return (
                                <button
                                    key={file.id}
                                    type="button"
                                    role="listitem"
                                    className="lib-tile"
                                    onClick={() => setSelectedFileId(file.id)}
                                >
                                    <div className="lib-thumb">
                                        <span
                                            className={`lib-storage-badge lib-storage-badge--${scopeClass}`}
                                        >
                                            {getStorageScopeLabel(scope)}
                                        </span>
                                        <FileThumbnail
                                            file={file}
                                            onAuthError={onRedirectToLogin}
                                        />
                                        <span className="lib-thumb-fallback" aria-hidden="true">
                                            {shortFileType(file)}
                                        </span>
                                    </div>
                                    <div className="lib-tile-body">
                                        <span
                                            className={`lib-tile-storage-inline lib-tile-storage-inline--${scopeClass}`}
                                        >
                                            {getStorageScopeLabel(scope)}
                                        </span>
                                        <span
                                            className="lib-tile-name"
                                            title={file.filename}
                                        >
                                            {file.filename}
                                        </span>
                                        <span className="lib-tile-meta">
                                            by {file.uploadedBy || "Unknown"}
                                        </span>
                                        {(file.accessMode === "local_only" || file.share) && (
                                            <span className="lib-chips">
                                                {file.accessMode === "local_only" && (
                                                    <span className="lib-chip lib-chip--lan">
                                                        LAN only
                                                    </span>
                                                )}
                                                {file.share && (
                                                    <span className="lib-chip lib-chip--shared">
                                                        Shared
                                                    </span>
                                                )}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {isEmptyLibrary && (
                    <div className="lib-empty-card">
                        <h3>No files yet</h3>
                        <p>
                            Upload something to start your library — it&apos;ll show up here right
                            away.
                        </p>
                        <button
                            type="button"
                            className="lib-btn-upload-sm"
                            onClick={onGoToUpload}
                        >
                            Upload a file
                        </button>
                    </div>
                )}

                {!loading && deletedFiles.length > 0 && (
                    <div className="lib-deletion-log">
                        <p className="lib-section-title">Deletion log</p>
                        <div className="lib-deleted-grid" role="list">
                            {deletedFiles.map((file) => (
                                <button
                                    key={file.id}
                                    type="button"
                                    role="listitem"
                                    className="lib-tile lib-tile--deleted"
                                    onClick={() => setSelectedFileId(file.id)}
                                >
                                    <div className="lib-thumb">
                                        <span className="lib-thumb-fallback" aria-hidden="true">
                                            {shortFileType(file)}
                                        </span>
                                    </div>
                                    <div className="lib-tile-body">
                                        <span
                                            className="lib-tile-name"
                                            title={file.filename}
                                        >
                                            {file.filename}
                                        </span>
                                        <span className="lib-tile-meta">
                                            Deleted by {file.deletedBy || "Unknown"}
                                        </span>
                                    </div>
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
                        className="modal-card file-detail-modal lib-detail-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="file-detail-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="lib-modal-top">
                            <div>
                                <h3 id="file-detail-title" className="modal-title">
                                    {selectedFile.filename}
                                </h3>
                                <p className="lib-modal-meta">
                                    {selectedFile.deleted
                                        ? `Deleted by ${selectedFile.deletedBy || "Unknown"} · ${formatUploadDate(selectedFile.deletedAt)}`
                                        : `Uploaded by ${selectedFile.uploadedBy || "Unknown"} · ${formatUploadDate(selectedFile.uploadDate)} · ${formatFileSize(selectedFile.fileSize)}`}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="lib-modal-close"
                                onClick={() => setSelectedFileId(null)}
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>

                        {!selectedFile.deleted && (
                            <div className="file-detail-modal__preview lib-modal-preview">
                                {isTextFile(selectedFile) ? (
                                    <FileTextPreview
                                        file={selectedFile}
                                        onAuthError={onRedirectToLogin}
                                    />
                                ) : isDocumentPreviewFile(selectedFile) ? (
                                    <FileDocumentPreview
                                        file={selectedFile}
                                        onAuthError={onRedirectToLogin}
                                    />
                                ) : (
                                    <FileThumbnail
                                        file={selectedFile}
                                        onAuthError={onRedirectToLogin}
                                    />
                                )}
                            </div>
                        )}

                        {!selectedFile.deleted &&
                            (() => {
                                const scope = resolveStorageScope(selectedFile, {
                                    preferLocal: preferLocalLabels,
                                });
                                const scopeClass = scope === "local" ? "local" : "cloud";
                                return (
                                    <span
                                        className={`lib-modal-storage lib-modal-storage--${scopeClass}`}
                                    >
                                        ● {getStorageScopeLabel(scope)}
                                        {scope === "local" ? " · This Wi‑Fi" : " · Online"}
                                    </span>
                                );
                            })()}

                        <div className="lib-meta-grid">
                            <div className="lib-meta-item">
                                <p className="lib-meta-label">Uploader</p>
                                <p className="lib-meta-value">
                                    {selectedFile.uploadedBy || "Unknown"}
                                </p>
                            </div>
                            <div className="lib-meta-item">
                                <p className="lib-meta-label">Uploaded</p>
                                <p className="lib-meta-value">
                                    {formatUploadDate(selectedFile.uploadDate)}
                                </p>
                            </div>
                            {!selectedFile.deleted && (
                                <>
                                    <div className="lib-meta-item">
                                        <p className="lib-meta-label">Size</p>
                                        <p className="lib-meta-value">
                                            {formatFileSize(selectedFile.fileSize)}
                                        </p>
                                    </div>
                                    <div className="lib-meta-item">
                                        <p className="lib-meta-label">Type</p>
                                        <p className="lib-meta-value">
                                            {selectedFile.fileType || shortFileType(selectedFile)}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        {selectedFile.deleted ? (
                            <p className="files-muted">
                                This file was removed from storage. The log entry is kept for
                                history.
                            </p>
                        ) : (
                            <>
                                <div className="lib-access-wrap">
                                    <p className="lib-meta-label">Access</p>
                                    <select
                                        className="lib-access-select"
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
                                </div>
                                {selectedFile.accessMode === "local_only" && (
                                    <p className="files-muted file-detail-local-only-note">
                                        Local Only range:{" "}
                                        {selectedFile.localOnlyCidr ||
                                            "not set yet — switch to Local Only again on the intended Wi‑Fi"}
                                    </p>
                                )}

                                <div className="lib-modal-actions">
                                    <button
                                        type="button"
                                        className="lib-m-btn lib-m-btn--primary"
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
                                        className="lib-m-btn"
                                        onClick={() => handleDownload(selectedFile)}
                                    >
                                        Download
                                    </button>
                                    <button
                                        type="button"
                                        className="lib-m-btn lib-m-btn--danger"
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
