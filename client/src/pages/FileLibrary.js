import { useCallback, useEffect, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import ShareFileModal from "../components/ShareFileModal";
import {
    getApiUrl,
    authHeaders,
    formatFileSize,
    formatUploadDate,
} from "../utils/api";
import { ACCESS_MODES, canShareFile, getAccessModeLabel } from "../utils/accessModes";

function FileLibrary({ onRedirectToLogin, onGoToUpload }) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [shareFile, setShareFile] = useState(null);
    const [updatingModeId, setUpdatingModeId] = useState(null);

    const loadFiles = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`${getApiUrl()}/files`, {
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

    const handleAccessModeChange = async (fileId, nextMode) => {
        setUpdatingModeId(fileId);
        setError("");

        try {
            const res = await fetch(`${getApiUrl()}/files/${fileId}/access-mode`, {
                method: "PATCH",
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

            loadFiles();
        } catch {
            setError("Could not update access mode");
        } finally {
            setUpdatingModeId(null);
        }
    };

    const handleDownload = async (fileId, filename) => {
        try {
            const res = await fetch(`${getApiUrl()}/files/${fileId}/download`, {
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

    return (
        <section className="dashboard-page">
            <div className="dashboard-card files-page-card">
                <div className="files-section-header">
                    <h2 className="auth-title">File library</h2>
                    <button type="button" className="logout-btn files-upload-nav-btn" onClick={onGoToUpload}>
                        Upload file
                    </button>
                </div>
                <p className="files-page-intro">
                    Assign Private, Shared, or Local Only access modes. Local Only files
                    require a trusted network connection to download.
                </p>

                <NetworkStatusIndicator compact />

                {loading && <p className="files-muted">Loading your files…</p>}
                {error && <p className="error">{error}</p>}

                {!loading && !error && files.length === 0 && (
                    <p className="files-muted">
                        You have not uploaded any files yet.{" "}
                        <button type="button" className="files-link-btn" onClick={onGoToUpload}>
                            Upload your first file
                        </button>
                    </p>
                )}

                {!loading && files.length > 0 && (
                    <ul className="file-list file-list--library">
                        {files.map((file) => (
                            <li key={file.id} className="file-list-item file-list-item--library">
                                <div className="file-list-details">
                                    <span className="file-list-name">{file.filename}</span>
                                    <span className="file-list-meta">
                                        {file.fileType} · {formatFileSize(file.fileSize)} ·{" "}
                                        {formatUploadDate(file.uploadDate)}
                                    </span>
                                    <label className="file-access-mode-inline">
                                        <span className="file-access-mode-inline-label">Access:</span>
                                        <select
                                            className="file-access-mode-select file-access-mode-select--inline"
                                            value={file.accessMode || "private"}
                                            disabled={updatingModeId === file.id}
                                            onChange={(e) =>
                                                handleAccessModeChange(file.id, e.target.value)
                                            }
                                        >
                                            {ACCESS_MODES.map((mode) => (
                                                <option key={mode.value} value={mode.value}>
                                                    {mode.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    {file.accessMode === "local_only" && (
                                        <span className="file-list-access-badge file-list-access-badge--local">
                                            Local Only
                                        </span>
                                    )}
                                    {file.share && (
                                        <span className="file-list-share-badge">
                                            Shared
                                            {file.share.permission === "view" ? " (view only)" : ""}
                                        </span>
                                    )}
                                </div>
                                <div className="file-list-actions">
                                    <button
                                        type="button"
                                        className="file-share-btn"
                                        onClick={() => setShareFile(file)}
                                        disabled={!canShareFile(file)}
                                        title={
                                            canShareFile(file)
                                                ? "Create a share link"
                                                : "Private files cannot be shared"
                                        }
                                    >
                                        Share
                                    </button>
                                    <button
                                        type="button"
                                        className="file-download-btn"
                                        onClick={() => handleDownload(file.id, file.filename)}
                                    >
                                        Download
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {shareFile && (
                <ShareFileModal
                    file={shareFile}
                    onClose={() => setShareFile(null)}
                    onShareUpdated={loadFiles}
                />
            )}
        </section>
    );
}

export default FileLibrary;
