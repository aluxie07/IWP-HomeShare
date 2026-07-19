import { useEffect, useState } from "react";
import {
    detectLocalServer,
    getApiMode,
    getDiscoveredApiUrl,
    getStoredApiOverride,
    switchToCloudApi,
    testAndSetApiOverride,
} from "../utils/apiDiscovery";

const PUBLIC = process.env.PUBLIC_URL || "";
const LOCAL_ZIP_PATH = `${PUBLIC}/downloads/HomeShare-Local-Windows.zip`;
const LOCAL_ZIP_URL =
    process.env.REACT_APP_LOCAL_PACKAGE_URL || LOCAL_ZIP_PATH;
const LOCAL_EXE_URL = `${PUBLIC}/downloads/HomeShare-Local.exe`;

function LocalNetworkSetup({ onBack, onDiscoveryUpdated }) {
    const [apiMode, setApiMode] = useState(getApiMode());
    const [apiUrl, setApiUrl] = useState(getDiscoveredApiUrl());
    const [connected, setConnected] = useState(false);
    const [manualUrl, setManualUrl] = useState(getStoredApiOverride());
    const [status, setStatus] = useState("");
    const [isError, setIsError] = useState(false);
    const [checking, setChecking] = useState(false);
    const [zipAvailable, setZipAvailable] = useState(null);
    const [exeAvailable, setExeAvailable] = useState(null);
    const [shareInfo, setShareInfo] = useState(null);
    const [copyNote, setCopyNote] = useState("");

    const loadShareInfo = async (baseUrl) => {
        if (!baseUrl) {
            setShareInfo(null);
            return;
        }
        try {
            const res = await fetch(`${String(baseUrl).replace(/\/$/, "")}/local/share-info`, {
                signal: AbortSignal.timeout(2500),
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
        let cancelled = false;

        fetch(LOCAL_ZIP_URL, { method: "HEAD" })
            .then((res) => {
                if (!cancelled) {
                    setZipAvailable(res.ok);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setZipAvailable(false);
                }
            });

        fetch(LOCAL_EXE_URL, { method: "HEAD" })
            .then((res) => {
                if (!cancelled) {
                    setExeAvailable(res.ok);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setExeAvailable(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

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
            // Explicit Detect must probe localhost even on GitHub Pages HTTPS
            const result = await detectLocalServer();
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
                    "No local server on this PC (port 8080). Connected to cloud instead — keep the local window open, then Detect again."
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
                    ? "Switched to the cloud API. Detect again anytime to use the local server on this PC."
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
                    Download <strong>one package</strong> — no Node.js or Git install needed.
                    Unzip, double-click <strong>Start HomeShare.bat</strong>, set your MongoDB
                    URL on first launch, then this page will <strong>automatically</strong>{" "}
                    connect to <code>http://127.0.0.1:8080</code>.
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
                    <h3 className="files-section-title">Step 1 — Download (Windows)</h3>
                    <p className="files-muted">
                        Everything is included (Node + server). You only need a free MongoDB
                        Atlas connection string.
                    </p>
                    <div className="local-setup-downloads">
                        <a
                            className={`logout-btn local-setup-download-btn local-setup-download-btn--primary ${
                                zipAvailable === false ? "local-setup-download-btn--disabled" : ""
                            }`}
                            href={LOCAL_ZIP_URL}
                            download="HomeShare-Local-Windows.zip"
                            aria-disabled={zipAvailable === false}
                            onClick={(e) => {
                                if (zipAvailable === false) {
                                    e.preventDefault();
                                }
                            }}
                        >
                            Download HomeShare Local (.zip)
                        </a>
                        {exeAvailable && (
                            <a
                                className="auth-form__secondary-btn local-setup-download-btn"
                                href={LOCAL_EXE_URL}
                                download="HomeShare-Local.exe"
                            >
                                Download single .exe
                            </a>
                        )}
                        <a
                            className="files-link-btn"
                            href={`${PUBLIC}/downloads/local-network-readme.txt`}
                            download
                        >
                            Setup instructions (.txt)
                        </a>
                    </div>
                    {exeAvailable === false && zipAvailable !== false && (
                        <p className="files-muted">
                            Use the <strong>.zip</strong> for now (recommended). It includes
                            everything and the setup popup. A single .exe is built by CI when
                            possible and will appear here automatically.
                        </p>
                    )}
                    {zipAvailable === false && (
                        <p className="error local-setup-missing-zip">
                            <strong>Package not on this server yet.</strong> If you run the
                            site locally, build it once:{" "}
                            <code>cd server &amp;&amp; npm run build:local-package</code>
                            , then restart <code>npm start</code>. On GitHub Pages, merge to{" "}
                            <code>main</code> and wait for the deploy workflow. You can still use{" "}
                            <a href={`${PUBLIC}/downloads/start-homeshare-local.bat`} download>
                                start-homeshare-local.bat
                            </a>{" "}
                            if you have Node.js and Git installed.
                        </p>
                    )}
                    {zipAvailable === null && (
                        <p className="files-muted">Checking download availability…</p>
                    )}
                    <p className="files-muted local-setup-advanced">
                        Advanced (requires Node.js + Git):{" "}
                        <a href={`${PUBLIC}/downloads/start-homeshare-local.bat`} download>
                            .bat
                        </a>
                        {" · "}
                        <a href={`${PUBLIC}/downloads/start-homeshare-local.sh`} download>
                            .sh
                        </a>
                    </p>

                    <h3 className="files-section-title">Step 2 — Unzip and run</h3>
                    <p className="files-muted">
                        Unzip the download, then double-click{" "}
                        <strong>Start HomeShare.bat</strong>. On first run a setup window asks
                        for your <code>MONGO_URI</code> and optional admin email — then the
                        server starts. Keep the window open.
                    </p>

                    <h3 className="files-section-title">Step 3 — Detect local server</h3>
                    <p className="files-muted">
                        Keep the local server window open, then click Detect. This probes{" "}
                        <code>http://127.0.0.1:8080</code> from the site (normal browsing stays
                        on cloud until you Detect). If Detect still fails, try entering that
                        address in the box below, or allow local network access if the browser
                        prompts you.
                    </p>
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
                                Detect the local server above to load the share path for this
                                network. On the host, run the local server (as Administrator once
                                if Windows blocks sharing).
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
