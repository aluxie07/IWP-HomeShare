import { useEffect, useState } from "react";
import {
    getApiUrl,
    authHeaders,
    formatFileSize,
    formatUploadDate,
} from "../utils/api";
import { isLoggedIn } from "../utils/authStorage";

function SharedFile({ shareToken, onRedirectToLogin }) {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [downloadError, setDownloadError] = useState("");
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        if (!shareToken) {
            setError("No share token provided.");
            setLoading(false);
            return;
        }

        if (!isLoggedIn()) {
            sessionStorage.setItem("pendingShare", shareToken);
            onRedirectToLogin();
            return;
        }

        let cancelled = false;

        const load = async () => {
            try {
                const res = await fetch(
                    `${getApiUrl()}/shared/${encodeURIComponent(shareToken)}`,
                    { headers: authHeaders(), credentials: "include" }
                );
                const data = await res.json();

                if (res.status === 401) {
                    sessionStorage.setItem("pendingShare", shareToken);
                    onRedirectToLogin();
                    return;
                }

                if (!res.ok) {
                    if (!cancelled) {
                        setError(data.message || "Could not open shared file");
                    }
                    return;
                }

                if (!cancelled) {
                    setFile(data.file);
                }
            } catch {
                if (!cancelled) {
                    setError("Could not reach server. Is the backend running?");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [shareToken, onRedirectToLogin]);

    const handleDownload = async () => {
        setDownloadError("");
        setDownloading(true);

        try {
            const res = await fetch(
                `${getApiUrl()}/shared/${encodeURIComponent(shareToken)}/download`,
                { headers: authHeaders(), credentials: "include" }
            );

            if (res.status === 401) {
                onRedirectToLogin();
                return;
            }

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setDownloadError(data.message || "Download failed");
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

            if (file.downloadsRemaining != null) {
                setFile((prev) => ({
                    ...prev,
                    downloadsRemaining: Math.max(0, prev.downloadsRemaining - 1),
                }));
            }
        } catch {
            setDownloadError("Could not download file");
        } finally {
            setDownloading(false);
        }
    };

    return (
        <section className="dashboard-page">
            <div className="dashboard-card files-page-card">
                <h2 className="auth-title">Shared file</h2>

                {loading && <p className="files-muted">Loading shared file…</p>}
                {error && <p className="error">{error}</p>}

                {!loading && file && (
                    <>
                        <div className="shared-file-details">
                            <p>
                                <strong>File:</strong> {file.filename}
                            </p>
                            <p>
                                <strong>Shared by:</strong> {file.ownerUsername}
                            </p>
                            <p>
                                <strong>Type:</strong> {file.fileType} ·{" "}
                                {formatFileSize(file.fileSize)}
                            </p>
                            <p>
                                <strong>Uploaded:</strong>{" "}
                                {formatUploadDate(file.uploadDate)}
                            </p>
                            {file.shareExpiresAt && (
                                <p>
                                    <strong>Link expires:</strong>{" "}
                                    {formatUploadDate(file.shareExpiresAt)}
                                </p>
                            )}
                            {file.downloadsRemaining != null && (
                                <p>
                                    <strong>Downloads remaining:</strong>{" "}
                                    {file.downloadsRemaining}
                                </p>
                            )}
                            {file.accessMode === "local_only" && (
                                <p className="shared-file-local-only">
                                    Local Only — download requires the trusted network.
                                </p>
                            )}
                            {file.networkBlocked && file.networkMessage && (
                                <p className="shared-file-network-blocked">
                                    {file.networkMessage}
                                </p>
                            )}
                            {file.permission === "view" && (
                                <p className="shared-file-view-only">
                                    This link is view-only. Download is disabled.
                                </p>
                            )}
                        </div>

                        {file.canDownload && !file.networkBlocked && (
                            <button
                                type="button"
                                className="logout-btn"
                                onClick={handleDownload}
                                disabled={downloading}
                            >
                                {downloading ? "Downloading…" : "Download file"}
                            </button>
                        )}

                        {downloadError && <p className="error">{downloadError}</p>}
                    </>
                )}
            </div>
        </section>
    );
}

export default SharedFile;
