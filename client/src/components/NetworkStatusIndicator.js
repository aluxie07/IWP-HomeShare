import { useEffect, useState } from "react";
import { getApiUrl, authHeaders } from "../utils/api";

function accessLevelLabel(level) {
    switch (level) {
        case "trusted":
            return "Trusted network";
        case "restricted":
            return "Outside trusted network";
        case "unconfigured":
            return "Network not configured";
        default:
            return "Unknown";
    }
}

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
            <div className={`network-status network-status--loading ${compact ? "network-status--compact" : ""}`}>
                Checking network…
            </div>
        );
    }

    if (error) {
        return (
            <div className={`network-status network-status--error ${compact ? "network-status--compact" : ""}`}>
                {error}
            </div>
        );
    }

    if (!status) {
        return null;
    }

    const levelClass =
        status.accessLevel === "trusted"
            ? "network-status--trusted"
            : status.accessLevel === "restricted"
              ? "network-status--restricted"
              : "network-status--unconfigured";

    return (
        <div className={`network-status ${levelClass} ${compact ? "network-status--compact" : ""}`}>
            <div className="network-status__header">
                <span className="network-status__dot" aria-hidden="true" />
                <strong>{accessLevelLabel(status.accessLevel)}</strong>
            </div>
            {!compact && (
                <div className="network-status__details">
                    {status.configured && status.trustedNetwork && (
                        <p>
                            <span className="network-status__label">Subnet:</span>{" "}
                            {status.trustedNetwork.subnet}
                        </p>
                    )}
                    <p>
                        <span className="network-status__label">Your connection:</span>{" "}
                        {status.clientIp}
                    </p>
                    <p className="network-status__capabilities">
                        {status.capabilities?.localOnlyAccess
                            ? "Local Only files are available on this connection."
                            : status.configured
                              ? "Local Only files are blocked on this connection."
                              : "An administrator must register the trusted network before Local Only files work."}
                    </p>
                </div>
            )}
        </div>
    );
}

export default NetworkStatusIndicator;
