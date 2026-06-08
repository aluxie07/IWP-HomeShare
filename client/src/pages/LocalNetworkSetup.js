import { useState } from "react";
import {
    getApiMode,
    getDiscoveredApiUrl,
    getStoredApiOverride,
    initApiDiscovery,
    setApiOverride,
    testAndSetApiOverride,
} from "../utils/apiDiscovery";

const PUBLIC = process.env.PUBLIC_URL || "";

function LocalNetworkSetup({ onBack, onDiscoveryUpdated }) {
    const [apiMode, setApiMode] = useState(getApiMode());
    const [apiUrl, setApiUrl] = useState(getDiscoveredApiUrl());
    const [connected, setConnected] = useState(false);
    const [manualUrl, setManualUrl] = useState(getStoredApiOverride());
    const [status, setStatus] = useState("");
    const [isError, setIsError] = useState(false);
    const [checking, setChecking] = useState(false);

    const refreshDiscovery = async () => {
        setChecking(true);
        setStatus("");
        setIsError(false);

        try {
            const result = await initApiDiscovery();
            setApiMode(result.mode);
            setApiUrl(result.url);
            setConnected(result.connected);
            onDiscoveryUpdated?.(result);

            if (result.connected && (result.mode === "local" || result.mode === "manual")) {
                setStatus(
                    "Local server found. Local Network Mode is ready — register your trusted network under Network (admin)."
                );
                setIsError(false);
            } else if (result.mode === "cloud" && result.connected) {
                setStatus(
                    "Connected to the cloud API. Run the local server starter on this PC, then click “Detect local server” again."
                );
                setIsError(false);
            } else {
                setStatus(
                    "No server responded. Download and run the starter below, then detect again."
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

    const handleUseCloud = () => {
        setApiOverride("");
        const cloud = process.env.REACT_APP_API_URL;
        if (cloud) {
            setManualUrl("");
            setStatus("Cleared local override. Refreshing…");
            refreshDiscovery();
        } else {
            setStatus("No cloud API URL configured in this build.");
            setIsError(true);
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
                    The GitHub website cannot run a server by itself. Download the starter,
                    run it once on your PC, then this page will <strong>automatically</strong>{" "}
                    connect to <code>http://127.0.0.1:8080</code> when you refresh.
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
                    <h3 className="files-section-title">Step 1 — Download starter</h3>
                    <p className="files-muted">
                        Requires{" "}
                        <a href="https://nodejs.org" target="_blank" rel="noreferrer">
                            Node.js
                        </a>{" "}
                        installed.
                    </p>
                    <div className="local-setup-downloads">
                        <a
                            className="logout-btn local-setup-download-btn"
                            href={`${PUBLIC}/downloads/start-homeshare-local.bat`}
                            download
                        >
                            Download for Windows (.bat)
                        </a>
                        <a
                            className="auth-form__secondary-btn local-setup-download-btn"
                            href={`${PUBLIC}/downloads/start-homeshare-local.sh`}
                            download
                        >
                            Download for Mac/Linux (.sh)
                        </a>
                        <a
                            className="files-link-btn"
                            href={`${PUBLIC}/downloads/local-network-readme.txt`}
                            download
                        >
                            Setup instructions (.txt)
                        </a>
                    </div>

                    <h3 className="files-section-title">Step 2 — Run the starter</h3>
                    <p className="files-muted">
                        Double-click the file (or run in Terminal). Keep the window open.
                        First run may take a minute to install dependencies.
                    </p>

                    <h3 className="files-section-title">Step 3 — Detect local server</h3>
                    <button
                        type="button"
                        className="logout-btn"
                        onClick={refreshDiscovery}
                        disabled={checking}
                    >
                        {checking ? "Checking…" : "Detect local server"}
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

                <div className="message-area">
                    {status && <p className={isError ? "error" : "success"}>{status}</p>}
                </div>
            </div>
        </section>
    );
}

export default LocalNetworkSetup;
