import { useEffect, useState } from "react";
import {
    DEFAULT_LOCAL_URL,
    detectLocalServer,
    getApiMode,
    getDiscoveredApiUrl,
    getStoredApiOverride,
    switchToCloudApi,
    testAndSetApiOverride,
    buildApiFetchOptions,
    probeApiDetailed,
} from "../utils/apiDiscovery";

const PUBLIC = process.env.PUBLIC_URL || "";
const LOCAL_ZIP_PATH = `${PUBLIC}/downloads/HomeShare-Local-Windows.zip`;
const LOCAL_ZIP_URL =
    process.env.REACT_APP_LOCAL_PACKAGE_URL || LOCAL_ZIP_PATH;

function LocalNetworkSetup({ onBack, onDiscoveryUpdated }) {
    const [apiMode, setApiMode] = useState(getApiMode());
    const [apiUrl, setApiUrl] = useState(getDiscoveredApiUrl());
    const [connected, setConnected] = useState(false);
    const [manualUrl, setManualUrl] = useState(getStoredApiOverride());
    const [status, setStatus] = useState("");
    const [isError, setIsError] = useState(false);
    const [checking, setChecking] = useState(false);
    const [zipAvailable, setZipAvailable] = useState(null);
    const [shareInfo, setShareInfo] = useState(null);
    const [shareInfoLoading, setShareInfoLoading] = useState(false);
    const [copyNote, setCopyNote] = useState("");

    const loadShareInfo = async (baseUrl) => {
        if (!baseUrl) {
            setShareInfo(null);
            return null;
        }
        setShareInfoLoading(true);
        try {
            const res = await fetch(`${String(baseUrl).replace(/\/$/, "")}/local/share-info`, {
                ...buildApiFetchOptions(baseUrl),
            });
            if (!res.ok) {
                setShareInfo(null);
                return null;
            }
            const data = await res.json();
            setShareInfo(data);
            return data;
        } catch {
            setShareInfo(null);
            return null;
        } finally {
            setShareInfoLoading(false);
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

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const mode = getApiMode();
            const url = getDiscoveredApiUrl();
            if (mode !== "local" && mode !== "manual") {
                return;
            }
            const probe = await probeApiDetailed(url);
            if (cancelled || !probe.ok) {
                return;
            }
            setApiMode(mode);
            setApiUrl(url);
            setConnected(true);
        })();

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
            const result = await detectLocalServer();
            setApiMode(result.mode);
            setApiUrl(result.url);
            setConnected(result.connected);
            onDiscoveryUpdated?.(result);

            if (result.connected && (result.mode === "local" || result.mode === "manual")) {
                await loadShareInfo(result.url);
                setStatus(
                    "Local server found. Copy a LAN address below for other devices, then register your network under Network settings."
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
                    "No server responded. Download and run the zip below (Start HomeShare.bat), then Detect again."
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
            await loadShareInfo(result.url);
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

    const lanApiUrls =
        shareInfo?.apiUrls?.length > 0
            ? shareInfo.apiUrls
            : shareInfo?.lanIps?.map((ip) => `http://${ip}:8080`) || [];

    const renderLanUrlCopyBlock = () => {
        if (!isLocalActive) {
            return null;
        }

        return (
            <div className="local-setup-lan-urls">
                <h3 className="files-section-title">LAN address for other devices</h3>
                <p className="files-muted">
                    After Detect on the <strong>host PC</strong>, copy one of these URLs. On a
                    phone or another PC, open this site → Local Network Mode → paste under{" "}
                    <strong>Connect to this server</strong>.
                </p>
                {shareInfoLoading && (
                    <p className="files-muted">Loading LAN address from server…</p>
                )}
                {!shareInfoLoading && lanApiUrls.length > 0 && (
                    <ul className="local-setup-lan-url-list">
                        {lanApiUrls.map((url) => (
                            <li key={url} className="local-setup-lan-url-row">
                                <code className="local-setup-lan-url-text">{url}</code>
                                <button
                                    type="button"
                                    className="auth-form__secondary-btn local-setup-lan-copy-btn"
                                    onClick={() => copyText(url)}
                                >
                                    Copy
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {!shareInfoLoading && lanApiUrls.length === 0 && (
                    <p className="files-muted">
                        Could not read a LAN IP from the server. On the host PC run{" "}
                        <code>ipconfig</code> and use{" "}
                        <code>http://YOUR-WIFI-IP:8080</code>.
                    </p>
                )}
                {copyNote && <p className="files-muted local-setup-copy-note">{copyNote}</p>}
            </div>
        );
    };

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
                    Download <strong>one zip</strong> — no Node.js install needed. Unzip,
                    double-click <strong>Start HomeShare.bat</strong>, paste your MongoDB URI on
                    first launch, then <strong>Detect local server</strong> below.
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
                        <a
                            className="files-link-btn"
                            href={`${PUBLIC}/downloads/local-network-readme.txt`}
                            download
                        >
                            Setup instructions (.txt)
                        </a>
                    </div>
                    {zipAvailable === false && (
                        <p className="error local-setup-missing-zip">
                            <strong>Package not on this server yet.</strong> Push to{" "}
                            <code>main</code> and wait for the deploy workflow, or build locally:{" "}
                            <code>cd server &amp;&amp; npm run build:local-package</code>
                        </p>
                    )}
                    {zipAvailable === null && (
                        <p className="files-muted">Checking download availability…</p>
                    )}

                    <h3 className="files-section-title">Step 2 — Unzip and run</h3>
                    <p className="files-muted">
                        Unzip anywhere, double-click <strong>Start HomeShare.bat</strong>. On first
                        run a setup window asks for <code>MONGO_URI</code> — config is saved to{" "}
                        <code>%APPDATA%\HomeShare\local-server\.env</code>. Keep the window open.
                    </p>

                    <h3 className="files-section-title">Step 3 — Detect local server</h3>
                    <p className="files-muted">
                        Click Detect to probe <code>http://127.0.0.1:8080</code>. Allow local
                        network access if the browser asks.
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

                    {renderLanUrlCopyBlock()}
                </div>

                <div className="local-setup-manual">
                    <h3 className="files-section-title">Other devices on the same Wi-Fi</h3>
                    <p className="error">
                        <strong>Detect does not work on phones or other PCs</strong> — it only
                        checks <code>127.0.0.1</code> on the device you’re holding. Enter the{" "}
                        <strong>host PC’s LAN address</strong> below instead.
                    </p>
                    <form onSubmit={handleSaveManualUrl}>
                        <label className="share-modal-label">
                            Local server address
                            <input
                                type="url"
                                placeholder="http://192.168.50.193:8080"
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
