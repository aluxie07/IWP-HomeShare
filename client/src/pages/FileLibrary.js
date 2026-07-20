import { useCallback, useEffect, useMemo, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import ShareFileModal from "../components/ShareFileModal";
import FileThumbnail from "../components/FileThumbnail";
import {
    getApiUrl,
    authHeaders,
    formatFileSize,
    formatUploadDate,
} from "../utils/api";
import { ACCESS_MODES, canShareFile } from "../utils/accessModes";
import {
    STORAGE_FILTERS,
    getStorageScopeLabel,
    matchesStorageFilter,
} from "../utils/fileStorageScope";

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
    const [storageFilter, setStorageFilter] = useState("all");

    const activeFiles = useMemo(
        () => files.filter((file) => !file.deleted),
        [files]
    );
    const filteredActiveFiles = useMemo(
        () => activeFiles.filter((file) => matchesStorageFilter(file, storageFilter)),
        [activeFiles, storageFilter]
    );
    const deletedFiles = useMemo(
        () => files.filter((file) => file.deleted),
        [files]
    );
    const selectedFile = useMemo(
        () => files.find((file) => file.id === selectedFileId) || null,
        [files, selectedFileId]
    );

    const loadFiles = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`${getApiUrl()}/files`, {
                credentials: "include",
                headers: authHeaders(),
            });

            if (res.status === 401) {
                onRedirectToLogin();
                return;
            }

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || "Could not load files");
                return;
            }

            setFiles(data.files || []);
        } catch {
            setError("Could not reach server. Is the backend running?");
        } finally {
            setLoading(false);
        }
    }, [onRedirectToLogin]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

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
            const syncRes = await fetch(`${getApiUrl()}/files/sync-folder`, {
                method: "POST",
                credentials: "include",
                headers: authHeaders(),
            });

            if (syncRes.status === 401) {
                onRedirectToLogin();
                return;
            }

            const syncData = await syncRes.json().catch(() => ({}));

            if (syncRes.ok && Array.isArray(syncData.files)) {
                setFiles(syncData.files);
                if (syncData.skipped) {
                    setSyncNote(
                        "Connected to the cloud API — drop-folder sync needs Detect local server first."
                    );
                } else if (syncData.message) {
                    setSyncNote(syncData.message);
                }
                return;
            }

            const res = await fetch(`${getApiUrl()}/files`, {
                credentials: "include",
                headers: authHeaders(),
            });

            if (res.status === 401) {
                onRedirectToLogin();
                return;
            }

            const data = await res.json();
            if (!res.ok) {
                setError(data.message || syncData.message || "Could not refresh files");
                return;
            }

            setFiles(data.files || []);
            setSyncNote("Library refreshed");
        } catch {
            setError("Could not refresh. Is the local server running?");
        } finally {
            setRefreshing(false);
        }
    };

    const handleDelete = async (fileId, filename) => {
        if (
            !window.confirm(
                `Delete "${filename}"? The file will be removed, but a log entry will stay in the library.`
            )
        ) {
            return;
        }

        setDeletingId(fileId);
        setError("");

        try {
            const res = await fetch(`${getApiUrl()}/files/${fileId}`, {
                method: "DELETE",
                credentials: "include",
                headers: authHeaders(),
            });

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

    const handleAccessModeChange = async (fileId, nextMode) => {
        setUpdatingModeId(fileId);
        setError("");

        try {
            const res = await fetch(`${getApiUrl()}/files/${fileId}/access-mode`, {
                method: "PATCH",
                credentials: "include",
                headers: {
                    ...authHeaders(),
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
                    prev.map((file) => (file.id === fileId ? { ...file, ...data.file } : file))
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

    const handleDownload = async (fileId, filename) => {
        try {
            const res = await fetch(`${getApiUrl()}/files/${fileId}/download`, {
                credentials: "include",
                headers: authHeaders(),
            });

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
            link.download = filename;
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
                        {filteredActiveFiles.map((file) => (
                            <button
                                key={file.id}
                                type="button"
                                role="listitem"
                                className="file-grid-tile"
                                onClick={() => setSelectedFileId(file.id)}
                            >
                                <span
                                    className={`file-grid-tile__storage-badge file-grid-tile__storage-badge--${
                                        file.storageScope === "local" ? "local" : "cloud"
                                    }`}
                                >
                                    {getStorageScopeLabel(file.storageScope)}
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
                        ))}
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
                            {!selectedFile.deleted && (
                                <p>
                                    <span className="file-detail-label">Storage</span>
                                    <span
                                        className={`file-grid-tile__storage-badge file-grid-tile__storage-badge--${
                                            selectedFile.storageScope === "local"
                                                ? "local"
                                                : "cloud"
                                        } file-grid-tile__storage-badge--inline`}
                                    >
                                        {getStorageScopeLabel(selectedFile.storageScope)}
                                    </span>
                                    {selectedFile.storageScope === "local"
                                        ? " — on this PC’s HomeShare folder"
                                        : " — in cloud storage (Render / Atlas)"}
                                </p>
                            )}
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
                                                selectedFile.id,
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
                                        onClick={() =>
                                            handleDownload(
                                                selectedFile.id,
                                                selectedFile.filename
                                            )
                                        }
                                    >
                                        Download
                                    </button>
                                    <button
                                        type="button"
                                        className="share-revoke-btn"
                                        onClick={() =>
                                            handleDelete(
                                                selectedFile.id,
                                                selectedFile.filename
                                            )
                                        }
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
