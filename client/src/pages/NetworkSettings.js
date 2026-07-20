import { useCallback, useEffect, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import { getApiUrl, authHeaders } from "../utils/api";
import { getApiMode } from "../utils/apiDiscovery";

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
                credentials: "include",
                headers: authHeaders(),
            });

            if (res.status === 401) {
                onRedirectToLogin();
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

    const isAdmin = Boolean(config?.isNetworkAdmin);
    const canRegister = Boolean(config?.canRegister);
    const requiresLocalServer = Boolean(config?.requiresLocalServer);
    const onLocalApi =
        getApiMode() === "local" ||
        getApiMode() === "manual" ||
        !getApiUrl().includes("onrender.com");

    const handleRegister = async () => {
        setSubmitting(true);
        setStatus("");
        setIsError(false);

        try {
            const res = await fetch(`${getApiUrl()}/admin/network/register`, {
                method: "POST",
                credentials: "include",
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
        if (!isAdmin) {
            return;
        }

        setSubmitting(true);
        setStatus("");
        setIsError(false);

        try {
            const res = await fetch(`${getApiUrl()}/admin/network`, {
                method: "PUT",
                credentials: "include",
                headers: {
                    ...authHeaders(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ label, gatewayIp }),
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
        if (!isAdmin) {
            return;
        }
        if (
            !window.confirm(
                "Remove this network registration? Others on this Wi-Fi will no longer share a library until someone registers again."
            )
        ) {
            return;
        }

        setSubmitting(true);
        setStatus("");
        setIsError(false);

        try {
            const res = await fetch(`${getApiUrl()}/admin/network`, {
                method: "DELETE",
                credentials: "include",
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
                    <h2 className="auth-title">Network settings</h2>
                    <button type="button" className="files-link-btn" onClick={onBack}>
                        Back to dashboard
                    </button>
                </div>

                <p className="files-page-intro network-settings-intro">
                    The first person to register your Wi-Fi becomes the <strong>network admin</strong>.
                    Others on that network can see shared files uploaded here, but only the admin can
                    change these settings. A different Wi-Fi (different subnet) gets its own registration.
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
                                            ? "on registered network"
                                            : "not on a registered network"}
                                    </>
                                )}
                            </p>
                        )}

                        {config?.configured && config.networkAdminUsername && (
                            <p className="files-muted">
                                Network admin: <strong>{config.networkAdminUsername}</strong>
                                {isAdmin ? " (you)" : ""}
                            </p>
                        )}

                        {requiresLocalServer && (
                            <p className="error">
                                You are on the <strong>cloud API</strong>, which only sees your
                                public internet address — not home Wi‑Fi. Go to{" "}
                                <strong>Local Network setup</strong>, start the server on this PC
                                (see Step 1 there), click <strong>Detect</strong> (or enter{" "}
                                <code>http://YOUR-PC-IP:8080</code>), then return here to register.
                            </p>
                        )}

                        {onLocalApi && !config?.configured && canRegister && (
                            <p className="files-muted">
                                Connected to your local server. If Detect used{" "}
                                <code>127.0.0.1</code>, enter your Wi‑Fi subnet below (from{" "}
                                <code>ipconfig</code>, e.g. if IPv4 is 192.168.1.42 use{" "}
                                <code>192.168.1.0/24</code>).
                            </p>
                        )}

                        {config?.subnetAlreadyRegistered && !config?.configured && (
                            <p className="files-muted">
                                This Wi-Fi is already registered. Ask the network admin if you need
                                changes — you can still use shared files when connected here.
                            </p>
                        )}

                        {!config?.configured && canRegister && (
                            <form
                                className="network-settings-form"
                                onSubmit={(e) => e.preventDefault()}
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
                                    Subnet (CIDR) — required on local server if using 127.0.0.1
                                    <input
                                        type="text"
                                        value={subnet}
                                        onChange={(e) => setSubnet(e.target.value)}
                                        placeholder="192.168.1.0/24"
                                        required
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
                                    <button
                                        type="button"
                                        className="logout-btn"
                                        onClick={handleRegister}
                                        disabled={submitting}
                                    >
                                        {submitting
                                            ? "Registering…"
                                            : "Register this network (become admin)"}
                                    </button>
                                </div>
                            </form>
                        )}

                        {config?.configured && (
                            <form className="network-settings-form" onSubmit={handleSave}>
                                <label className="share-modal-label">
                                    Network label
                                    <input
                                        type="text"
                                        value={label}
                                        onChange={(e) => setLabel(e.target.value)}
                                        placeholder="Home Wi-Fi"
                                        disabled={!isAdmin}
                                    />
                                </label>
                                <label className="share-modal-label">
                                    Subnet (CIDR)
                                    <input
                                        type="text"
                                        value={subnet}
                                        readOnly
                                        disabled
                                    />
                                </label>
                                <label className="share-modal-label">
                                    Gateway IP (optional)
                                    <input
                                        type="text"
                                        value={gatewayIp}
                                        onChange={(e) => setGatewayIp(e.target.value)}
                                        placeholder="192.168.1.1"
                                        disabled={!isAdmin}
                                    />
                                </label>

                                {isAdmin ? (
                                    <div className="network-settings-actions">
                                        <button
                                            type="submit"
                                            className="logout-btn"
                                            disabled={submitting}
                                        >
                                            {submitting ? "Saving…" : "Save changes"}
                                        </button>
                                        <button
                                            type="button"
                                            className="share-revoke-btn"
                                            onClick={handleReset}
                                            disabled={submitting}
                                        >
                                            Remove network registration
                                        </button>
                                    </div>
                                ) : (
                                    <p className="files-muted">
                                        Only {config.networkAdminUsername || "the network admin"}{" "}
                                        can edit or remove this network&apos;s settings.
                                    </p>
                                )}
                            </form>
                        )}

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
