import { useCallback, useEffect, useState } from "react";
import {
    API_URL,
    authHeaders,
    formatFileSize,
    formatUploadDate,
} from "../utils/api";

function FileLibrary({ onRedirectToLogin, onGoToUpload }) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadFiles = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`${API_URL}/files`, {
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

    const handleDownload = async (fileId, filename) => {
        try {
            const res = await fetch(`${API_URL}/files/${fileId}/download`, {
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
                    Files you have uploaded. Only you can see and download your files.
                </p>

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
                                </div>
                                <button
                                    type="button"
                                    className="file-download-btn"
                                    onClick={() => handleDownload(file.id, file.filename)}
                                >
                                    Download
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

export default FileLibrary;
