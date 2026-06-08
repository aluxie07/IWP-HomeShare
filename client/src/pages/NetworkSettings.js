import { useCallback, useEffect, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import { getApiUrl, authHeaders } from "../utils/api";

function NetworkSettings({ onRedirectToLogin, onBack }) {
    const [config, setConfig] = useState(null);
    const [label, setLabel] = useState("Trusted network");
    const [subnet, setSubnet] = useState("");
    const [gatewayIp, setGatewayIp] = useState("");
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("");
    const [isError, setIsError] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const loadConfig = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${getApiUrl()}/admin/network`, {
                headers: authHeaders(),
            });

            if (res.status === 401) {
                onRedirectToLogin();
                return;
            }

            if (res.status === 403) {
                setStatus("Administrator access is required to manage network settings.");
                setIsError(true);
                return;
            }

            const data = await res.json();
            setConfig(data);

            if (data.configured) {
                setLabel(data.label || "Trusted network");
                setSubnet(data.subnet || "");
                setGatewayIp(data.gatewayIp || "");
            } else if (data.suggestedSubnet) {
                setSubnet(data.suggestedSubnet);
            }
        } catch {
            setStatus("Could not load network settings.");
            setIsError(true);
        } finally {
            setLoading(false);
        }
    }, [onRedirectToLogin]);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    const handleRegister = async () => {
        setSubmitting(true);
        setStatus("");
        setIsError(false);

        try {
            const res = await fetch(`${getApiUrl()}/admin/network/register`, {
                method: "POST",
                headers: {
                    ...authHeaders(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    label,
                    subnet: subnet || undefined,
                    gatewayIp: gatewayIp || undefined,
                }),
            });

            const data = await res.json();

            if (res.status === 401) {
                onRedirectToLogin();
                return;
            }

            if (!res.ok) {
                setStatus(data.message || "Could not register network");
                setIsError(true);
                return;
            }

            setStatus(data.message);
            setIsError(false);
            loadConfig();
        } catch {
            setStatus("Could not reach server.");
            setIsError(true);
        } finally {
            setSubmitting(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setStatus("");
        setIsError(false);

        try {
            const res = await fetch(`${getApiUrl()}/admin/network`, {
                method: "PUT",
                headers: {
                    ...authHeaders(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ label, subnet, gatewayIp }),
            });

            const data = await res.json();

            if (!res.ok) {
                setStatus(data.message || "Could not save settings");
                setIsError(true);
                return;
            }

            setStatus(data.message);
            setIsError(false);
            loadConfig();
        } catch {
            setStatus("Could not reach server.");
            setIsError(true);
        } finally {
            setSubmitting(false);
        }
    };

    const handleReset = async () => {
        if (!window.confirm("Reset trusted network configuration? Local Only files will be blocked until you register again.")) {
            return;
        }

        setSubmitting(true);
        setStatus("");
        setIsError(false);

        try {
            const res = await fetch(`${getApiUrl()}/admin/network`, {
                method: "DELETE",
                headers: authHeaders(),
            });

            const data = await res.json();

            if (!res.ok) {
                setStatus(data.message || "Could not reset configuration");
                setIsError(true);
                return;
            }

            setStatus(data.message);
            setIsError(false);
            setSubnet(config?.suggestedSubnet || "");
            setGatewayIp("");
            loadConfig();
        } catch {
            setStatus("Could not reach server.");
            setIsError(true);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="dashboard-page dashboard-page--wide">
            <div className="dashboard-card network-settings-card">
                <div className="network-settings-header">
                    <h2 className="auth-title">Trusted network settings</h2>
                    <button type="button" className="files-link-btn" onClick={onBack}>
                        Back to dashboard
                    </button>
                </div>

                <p className="files-page-intro network-settings-intro">
                    Register your home or office Wi-Fi as the trusted network. Files marked
                    Local Only are only downloadable when users connect from this subnet.
                </p>

                <NetworkStatusIndicator compact />

                {loading && <p className="files-muted">Loading settings…</p>}

                {!loading && (
                    <>
                        {config?.currentClientIp && (
                            <p className="network-settings-ip">
                                Detected connection: <strong>{config.currentClientIp}</strong>
                                {config.isCurrentClientTrusted != null && (
                                    <>
                                        {" "}
                                        —{" "}
                                        {config.isCurrentClientTrusted
                                            ? "on trusted network"
                                            : "outside trusted network"}
                                    </>
                                )}
                            </p>
                        )}

                        <form
                            className="network-settings-form"
                            onSubmit={
                                config?.configured
                                    ? handleSave
                                    : (e) => e.preventDefault()
                            }
                        >
                            <label className="share-modal-label">
                                Network label
                                <input
                                    type="text"
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    placeholder="Home Wi-Fi"
                                />
                            </label>
                            <label className="share-modal-label">
                                Subnet (CIDR)
                                <input
                                    type="text"
                                    value={subnet}
                                    onChange={(e) => setSubnet(e.target.value)}
                                    placeholder="192.168.1.0/24"
                                    required={Boolean(config?.configured)}
                                />
                            </label>
                            <label className="share-modal-label">
                                Gateway IP (optional)
                                <input
                                    type="text"
                                    value={gatewayIp}
                                    onChange={(e) => setGatewayIp(e.target.value)}
                                    placeholder="192.168.1.1"
                                />
                            </label>

                            <div className="network-settings-actions">
                                {!config?.configured ? (
                                    <button
                                        type="button"
                                        className="logout-btn"
                                        onClick={handleRegister}
                                        disabled={submitting}
                                    >
                                        {submitting
                                            ? "Registering…"
                                            : "Register current network"}
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="submit"
                                            className="logout-btn"
                                            disabled={submitting}
                                        >
                                            {submitting ? "Saving…" : "Save changes"}
                                        </button>
                                        <button
                                            type="button"
                                            className="auth-form__secondary-btn"
                                            onClick={handleRegister}
                                            disabled={submitting}
                                        >
                                            Re-register from this device
                                        </button>
                                        <button
                                            type="button"
                                            className="share-revoke-btn"
                                            onClick={handleReset}
                                            disabled={submitting}
                                        >
                                            Reset configuration
                                        </button>
                                    </>
                                )}
                            </div>
                        </form>

                        {config?.configured && config.registeredAt && (
                            <p className="files-muted network-settings-meta">
                                Registered {new Date(config.registeredAt).toLocaleString()}
                                {config.registeredFromIp
                                    ? ` from ${config.registeredFromIp}`
                                    : ""}
                            </p>
                        )}
                    </>
                )}

                <div className="message-area">
                    {status && <p className={isError ? "error" : "success"}>{status}</p>}
                </div>
            </div>
        </section>
    );
}

export default NetworkSettings;
