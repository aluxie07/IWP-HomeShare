import { useEffect, useState } from "react";
import {
    DEFAULT_LOCAL_URL,
    detectLocalServer,
    getApiMode,
    getDiscoveredApiUrl,
    getStoredApiOverride,
    switchToCloudApi,
    testAndSetApiOverride,
} from "../utils/apiDiscovery";

function LocalNetworkSetup({ onBack, onDiscoveryUpdated }) {
    const [apiMode, setApiMode] = useState(getApiMode());
    const [apiUrl, setApiUrl] = useState(getDiscoveredApiUrl());
    const [connected, setConnected] = useState(false);
    const [manualUrl, setManualUrl] = useState(getStoredApiOverride());
    const [status, setStatus] = useState("");
    const [isError, setIsError] = useState(false);
    const [checking, setChecking] = useState(false);
    const [shareInfo, setShareInfo] = useState(null);
    const [copyNote, setCopyNote] = useState("");

    const loadShareInfo = async (baseUrl) => {
        if (!baseUrl) {
            setShareInfo(null);
            return;
        }
        try {
            const res = await fetch(`${String(baseUrl).replace(/\/$/, "")}/local/share-info`, {
                mode: "cors",
                cache: "no-store",
                signal: AbortSignal.timeout(5000),
                ...(typeof window !== "undefined" &&
                window.location.protocol === "https:" &&
                /127\.0\.0\.1|localhost/.test(baseUrl)
                    ? { targetAddressSpace: "local" }
                    : {}),
            });
            if (!res.ok) {
                setShareInfo(null);
                return;
            }
            const data = await res.json();
            setShareInfo(data);
        } catch {
            setShareInfo(null);
        }
    };

    useEffect(() => {
        if (connected && (apiMode === "local" || apiMode === "manual")) {
            loadShareInfo(apiUrl);
        } else {
            setShareInfo(null);
        }
    }, [connected, apiMode, apiUrl]);

    const copyText = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopyNote("Copied!");
            setTimeout(() => setCopyNote(""), 2000);
        } catch {
            setCopyNote("Copy failed — select the path and copy manually.");
        }
    };

    const refreshDiscovery = async () => {
        setChecking(true);
        setStatus("");
        setIsError(false);

        try {
            const result = await detectLocalServer();
            setApiMode(result.mode);
            setApiUrl(result.url);
            setConnected(result.connected);
            onDiscoveryUpdated?.(result);

            if (result.connected && (result.mode === "local" || result.mode === "manual")) {
                setStatus(
                    "Local server found. Register your trusted network under Network settings (first registrant becomes admin)."
                );
                setIsError(false);
            } else if (result.mode === "cloud" && result.connected) {
                setManualUrl(DEFAULT_LOCAL_URL);
                setStatus(
                    [
                        "Could not reach http://127.0.0.1:8080 from this browser, so the site stayed on cloud.",
                        "Start the server on this PC (see Step 1), keep the terminal open, then Detect again.",
                        "If Chrome/Edge asks for Local network access, click Allow.",
                        "Or click “Connect to this PC” below.",
                        result.detectError ? `(${result.detectError})` : "",
                    ]
                        .filter(Boolean)
                        .join(" ")
                );
                setIsError(true);
            } else {
                setStatus(
                    "No server responded on port 8080. Start the server on this PC (Step 1), then Detect again."
                );
                setIsError(true);
            }
        } catch {
            setStatus("Could not check for a local server.");
            setIsError(true);
        } finally {
            setChecking(false);
        }
    };

    const handleConnectThisPc = async () => {
        setManualUrl(DEFAULT_LOCAL_URL);
        setChecking(true);
        setStatus("");
        setIsError(false);
        try {
            const result = await testAndSetApiOverride(DEFAULT_LOCAL_URL);
            setApiMode(result.mode);
            setApiUrl(result.url);
            setConnected(true);
            onDiscoveryUpdated?.(result);
            setStatus(`Connected to ${result.url}.`);
            setIsError(false);
        } catch (err) {
            setStatus(
                `${err.message || "Connect failed"}. Open this site on the host PC, start the server, and allow Local network access if the browser asks.`
            );
            setIsError(true);
        } finally {
            setChecking(false);
        }
    };

    const handleSaveManualUrl = async (e) => {
        e.preventDefault();
        setChecking(true);
        setStatus("");
        setIsError(false);

        try {
            const result = await testAndSetApiOverride(manualUrl);
            setApiMode(result.mode);
            setApiUrl(result.url);
            setConnected(true);
            onDiscoveryUpdated?.(result);
            setStatus(`Connected to ${result.url}. Use this on other devices on the same Wi-Fi.`);
            setIsError(false);
        } catch (err) {
            setStatus(err.message);
            setIsError(true);
        } finally {
            setChecking(false);
        }
    };

    const handleUseCloud = async () => {
        setChecking(true);
        setStatus("");
        setIsError(false);
        try {
            const result = await switchToCloudApi();
            setApiMode(result.mode);
            setApiUrl(result.url);
            setConnected(result.connected);
            onDiscoveryUpdated?.(result);
            setStatus(
                result.connected
                    ? "Switched to the cloud API. Detect again anytime to use a LAN server on this PC."
                    : "Cleared local override, but cloud API did not respond."
            );
            setIsError(!result.connected);
        } catch (err) {
            setStatus(err.message || "No cloud API URL configured in this build.");
            setIsError(true);
        } finally {
            setChecking(false);
        }
    };

    const isLocalActive =
        connected && (apiMode === "local" || apiMode === "manual");

    return (
        <section className="dashboard-page dashboard-page--wide">
            <div className="dashboard-card network-settings-card">
                <div className="network-settings-header">
                    <h2 className="auth-title">Local Network Mode setup</h2>
                    <button type="button" className="files-link-btn" onClick={onBack}>
                        Back
                    </button>
                </div>

                <p className="files-page-intro network-settings-intro">
                    Run the HomeShare API on a PC on your Wi‑Fi, then connect this site to it.
                    Normal browsing uses the cloud API until you Detect or enter a LAN address.
                </p>

                <div
                    className={`local-setup-status ${
                        isLocalActive
                            ? "local-setup-status--active"
                            : "local-setup-status--inactive"
                    }`}
                >
                    <p>
                        <strong>Current API:</strong> {apiUrl || "—"}
                    </p>
                    <p>
                        <strong>Mode:</strong>{" "}
                        {isLocalActive
                            ? "Local Network Mode"
                            : apiMode === "cloud"
                              ? "Cloud (Render)"
                              : "Not connected"}
                    </p>
                </div>

                <div className="local-setup-steps">
                    <h3 className="files-section-title">Step 1 — Start the server on this PC</h3>
                    <p className="files-muted">
                        From the project repo (requires Node.js):
                    </p>
                    <ol className="local-setup-join-steps">
                        <li>
                            <code>cd server</code>
                        </li>
                        <li>
                            Copy <code>.env.example</code> to <code>.env</code> and set{" "}
                            <code>MONGO_URI</code>, <code>JWT_SECRET</code>, and keep{" "}
                            <code>FILE_STORAGE=disk</code>
                        </li>
                        <li>
                            <code>npm install</code> then <code>npm start</code>
                        </li>
                        <li>Leave the terminal open — the API listens on port 8080</li>
                    </ol>

                    <h3 className="files-section-title">Step 2 — Connect this site</h3>
                    <p className="files-muted">
                        Click Detect to probe <code>http://127.0.0.1:8080</code>, or use Connect
                        to this PC. Allow local network access if the browser asks.
                    </p>
                    <button
                        type="button"
                        className="logout-btn"
                        onClick={refreshDiscovery}
                        disabled={checking}
                    >
                        {checking ? "Checking…" : "Detect local server"}
                    </button>
                    <button
                        type="button"
                        className="auth-form__secondary-btn"
                        onClick={handleConnectThisPc}
                        disabled={checking}
                        style={{ marginLeft: "0.75rem" }}
                    >
                        Connect to this PC (127.0.0.1)
                    </button>
                </div>

                <div className="local-setup-manual">
                    <h3 className="files-section-title">Other devices on the same Wi-Fi</h3>
                    <p className="files-muted">
                        Phones and tablets cannot use <code>127.0.0.1</code>. On the PC
                        running the server, find your LAN IP (e.g.{" "}
                        <code>192.168.1.100</code>) and enter it below on each device.
                    </p>
                    <form onSubmit={handleSaveManualUrl}>
                        <label className="share-modal-label">
                            Local server address
                            <input
                                type="url"
                                placeholder="http://192.168.1.100:8080"
                                value={manualUrl}
                                onChange={(e) => setManualUrl(e.target.value)}
                            />
                        </label>
                        <button
                            type="submit"
                            className="auth-form__secondary-btn"
                            disabled={checking || !manualUrl}
                        >
                            Connect to this server
                        </button>
                    </form>
                    {process.env.REACT_APP_API_URL && (
                        <button
                            type="button"
                            className="share-revoke-btn"
                            onClick={handleUseCloud}
                        >
                            Switch back to cloud API
                        </button>
                    )}
                </div>

                {isLocalActive && (
                    <div className="local-setup-join-folder">
                        <h3 className="files-section-title">Join the shared HomeShare folder</h3>
                        <p className="files-muted">
                            The host PC shares the same Explorer folder on the LAN. Other
                            Windows PCs can open it and see the same files.
                        </p>
                        {shareInfo?.preferredUnc || shareInfo?.uncPaths?.[0] ? (
                            <>
                                <p className="local-setup-unc">
                                    <code>{shareInfo.preferredUnc || shareInfo.uncPaths[0]}</code>
                                </p>
                                <button
                                    type="button"
                                    className="auth-form__secondary-btn"
                                    onClick={() =>
                                        copyText(shareInfo.preferredUnc || shareInfo.uncPaths[0])
                                    }
                                >
                                    Copy folder path
                                </button>
                                {copyNote && <p className="files-muted">{copyNote}</p>}
                                {!shareInfo.enabled && shareInfo.message && (
                                    <p className="error">{shareInfo.message}</p>
                                )}
                                <ol className="local-setup-join-steps">
                                    {(shareInfo.joinSteps || []).map((step) => (
                                        <li key={step}>{step}</li>
                                    ))}
                                </ol>
                            </>
                        ) : (
                            <p className="files-muted">
                                Detect the local server above to load the share path. On the host,
                                run the server as Administrator once if Windows blocks sharing.
                            </p>
                        )}
                        <p className="files-muted">
                            Phones: use the website with the LAN API address — they don’t get a
                            Windows folder.
                        </p>
                    </div>
                )}

                <div className="message-area">
                    {status && <p className={isError ? "error" : "success"}>{status}</p>}
                </div>
            </div>
        </section>
    );
}

export default LocalNetworkSetup;
