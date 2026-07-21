import { useEffect, useState } from "react";
import { getApiUrl, authHeaders } from "../utils/api";

function NetworkStatusIndicator({ compact = false, initialStatus = null }) {
    const [status, setStatus] = useState(initialStatus);
    const [loading, setLoading] = useState(!initialStatus);
    const [error, setError] = useState("");

    useEffect(() => {
        if (initialStatus) {
            setStatus(initialStatus);
            setLoading(false);
            return undefined;
        }

        let cancelled = false;

        async function load() {
            try {
                const res = await fetch(`${getApiUrl()}/network/status`, {
                    credentials: "include",
                    headers: authHeaders(),
                    cache: "no-store",
                });

                if (!res.ok) {
                    if (!cancelled) {
                        setError("Could not load network status");
                    }
                    return;
                }

                const data = await res.json();
                if (!cancelled) {
                    setStatus(data);
                }
            } catch {
                if (!cancelled) {
                    setError("Network status unavailable");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [initialStatus]);

    if (loading) {
        return (
            <div
                className={`network-status network-status--loading ${compact ? "network-status--compact" : ""}`}
            >
                Checking network…
            </div>
        );
    }

    if (error) {
        return (
            <div
                className={`network-status network-status--error ${compact ? "network-status--compact" : ""}`}
            >
                {error}
            </div>
        );
    }

    if (!status) {
        return null;
    }

    return (
        <div
            className={`network-status network-status--info ${compact ? "network-status--compact" : ""}`}
        >
            <div className="network-status__header">
                <span className="network-status__dot" aria-hidden="true" />
                <strong>Your connection</strong>
            </div>
            {!compact && (
                <div className="network-status__details">
                    <p>
                        <span className="network-status__label">IP:</span>{" "}
                        {status.clientIp || "unknown"}
                    </p>
                    <p className="network-status__capabilities">
                        {status.message ||
                            "Local Only files can only be downloaded from the same IP range as the uploader."}
                    </p>
                </div>
            )}
            {compact && (
                <p className="network-status__compact-ip">
                    IP {status.clientIp || "—"}
                </p>
            )}
        </div>
    );
}

export default NetworkStatusIndicator;
