import { useState } from "react";
import { getApiUrl, authHeaders } from "../utils/api";
import { buildShareLink } from "../utils/urlTokens";
import { canShareFile, getAccessModeLabel } from "../utils/accessModes";
import { resolveStorageScope } from "../utils/fileStorageScope";

function ShareFileModal({ file, onClose, onShareUpdated }) {
    const isLocalFile = resolveStorageScope(file) === "local";

    const [expiresInHours, setExpiresInHours] = useState("24");
    const [maxDownloads, setMaxDownloads] = useState("");
    const [viewOnly, setViewOnly] = useState(false);
    const [shareUrl, setShareUrl] = useState("");
    const [status, setStatus] = useState("");
    const [isError, setIsError] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCreateShare = async (e) => {
        e.preventDefault();
        setStatus("");
        setIsError(false);
        setCopied(false);
        setSubmitting(true);

        try {
            const res = await fetch(`${getApiUrl()}/files/${file.id}/share`, {
                method: "POST",
                credentials: "include",
                headers: {
                    ...authHeaders(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    expiresInHours: expiresInHours ? Number(expiresInHours) : null,
                    maxDownloads: maxDownloads ? Number(maxDownloads) : null,
                    viewOnly,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setStatus(data.message || "Could not create share link");
                setIsError(true);
                return;
            }

            const link = data.shareUrl || buildShareLink(data.shareToken);
            setShareUrl(link);
            setStatus("Share link created. Copy it below.");
            setIsError(false);
            onShareUpdated?.();
        } catch {
            setStatus("Could not reach server. Is the backend running?");
            setIsError(true);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevoke = async () => {
        setSubmitting(true);
        setStatus("");
        setIsError(false);

        try {
            const res = await fetch(`${getApiUrl()}/files/${file.id}/share`, {
                method: "DELETE",
                credentials: "include",
                headers: authHeaders(),
            });

            const data = await res.json();

            if (!res.ok) {
                setStatus(data.message || "Could not revoke share link");
                setIsError(true);
                return;
            }

            setShareUrl("");
            setStatus("Share link revoked.");
            setIsError(false);
            onShareUpdated?.();
        } catch {
            setStatus("Could not reach server.");
            setIsError(true);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCopy = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
        } catch {
            setCopied(false);
            setStatus("Copy failed. Select the link and copy manually.");
            setIsError(true);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} role="presentation">
            <div
                className="modal-card"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-labelledby="share-modal-title"
            >
                <h3 id="share-modal-title" className="modal-title">
                    Share file
                </h3>
                <p className="modal-file-name">{file.filename}</p>
                <p className="share-modal-access-mode">
                    Access mode: <strong>{getAccessModeLabel(file.accessMode)}</strong>
                </p>
                {file.accessMode === "local_only" && (
                    <p className="share-modal-network-note">
                        Recipients must be on the same local IP range as when this
                        file was set to Local Only (usually the same Wi‑Fi).
                        {file.localOnlyCidr ? (
                            <>
                                {" "}
                                Allowed range: <code>{file.localOnlyCidr}</code>
                            </>
                        ) : null}
                    </p>
                )}
                {isLocalFile && (
                    <p className="share-modal-local-warning" role="status">
                        Warning: Local shared files can only be downloaded if the other
                        user is connected to the same local HomeShare server.
                    </p>
                )}
                {!canShareFile(file) && (
                    <p className="error">
                        Private files cannot be shared. Change the access mode in your library
                        first.
                    </p>
                )}

                <form className="share-modal-form" onSubmit={handleCreateShare}>
                    <label className="share-modal-label">
                        Expires in (hours, optional)
                        <input
                            type="number"
                            min="1"
                            placeholder="No expiry"
                            value={expiresInHours}
                            onChange={(e) => setExpiresInHours(e.target.value)}
                        />
                    </label>
                    <label className="share-modal-label">
                        Max downloads (optional)
                        <input
                            type="number"
                            min="1"
                            placeholder="Unlimited"
                            value={maxDownloads}
                            onChange={(e) => setMaxDownloads(e.target.value)}
                        />
                    </label>
                    <label className="share-modal-checkbox">
                        <input
                            type="checkbox"
                            checked={viewOnly}
                            onChange={(e) => setViewOnly(e.target.checked)}
                        />
                        View only (no download)
                    </label>
                    <button
                        type="submit"
                        className="logout-btn"
                        disabled={submitting || !canShareFile(file)}
                    >
                        {submitting ? "Creating…" : "Generate share link"}
                    </button>
                </form>

                {shareUrl && (
                    <div className="share-link-box">
                        <input
                            type="text"
                            className="share-link-input"
                            value={shareUrl}
                            readOnly
                            onFocus={(e) => e.target.select()}
                        />
                        <button type="button" className="file-download-btn" onClick={handleCopy}>
                            {copied ? "Copied!" : "Copy link"}
                        </button>
                    </div>
                )}

                {file.share && (
                    <button
                        type="button"
                        className="share-revoke-btn"
                        onClick={handleRevoke}
                        disabled={submitting}
                    >
                        Revoke share link
                    </button>
                )}

                <div className="message-area">
                    {status && <p className={isError ? "error" : "success"}>{status}</p>}
                </div>

                <button type="button" className="modal-close-btn" onClick={onClose}>
                    Close
                </button>
            </div>
        </div>
    );
}

export default ShareFileModal;
