import { useCallback, useEffect, useRef, useState } from "react";
import {
    DEFAULT_LOCAL_URL,
    detectLocalServer,
    getApiMode,
    getDiscoveredApiUrl,
    getStoredApiOverride,
    switchToCloudApi,
    testAndSetApiOverride,
    buildApiFetchOptions,
} from "../utils/apiDiscovery";
import { isLoggedIn } from "../utils/authStorage";

const PUBLIC = process.env.PUBLIC_URL || "";
const LOCAL_ZIP_PATH = `${PUBLIC}/downloads/HomeShare-Local-Windows.zip`;
const LOCAL_ZIP_URL =
    process.env.REACT_APP_LOCAL_PACKAGE_URL || LOCAL_ZIP_PATH;
const ATLAS_URL = "https://www.mongodb.com/cloud/atlas/register";
const DETECT_THROTTLE_MS = 5000;

function softDetectFailure(detectError) {
    return [
        "Could not connect yet. Check these:",
        "Is the black HomeShare window still open on this PC? (Minimize is OK — don’t close it.)",
        "Did the browser ask to allow local or loopback network access? Click Allow, then try again.",
        "Open this website on the same PC that is running HomeShare.",
        detectError ? `(${detectError})` : "",
    ]
        .filter(Boolean)
        .join(" ");
}

function LocalNetworkSetup({
    onBack,
    onDiscoveryUpdated,
    onGoToLogin,
    onGoToLibrary,
    onGoToRegister,
}) {
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
    const [otherDevicesOpen, setOtherDevicesOpen] = useState(false);
    const lastDetectAt = useRef(0);

    const isLocalActive =
        connected && (apiMode === "local" || apiMode === "manual");

    const loadShareInfo = async (baseUrl) => {
        if (!baseUrl) {
            setShareInfo(null);
            return null;
        }
        setShareInfoLoading(true);
        try {
            const res = await fetch(
                `${String(baseUrl).replace(/\/$/, "")}/local/share-info`,
                {
                    ...buildApiFetchOptions(baseUrl),
                }
            );
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

    const applyDetectResult = useCallback(
        async (result, { quietFail = false } = {}) => {
            setApiMode(result.mode);
            setApiUrl(result.url);
            setConnected(result.connected);
            onDiscoveryUpdated?.(result);

            if (
                result.connected &&
                (result.mode === "local" || result.mode === "manual")
            ) {
                await loadShareInfo(result.url);
                setStatus(
                    "Connected. Next, create an account or log in so you can upload files."
                );
                setIsError(false);
                return true;
            }

            if (!quietFail) {
                if (result.mode === "cloud" && result.connected) {
                    setManualUrl(DEFAULT_LOCAL_URL);
                    setStatus(softDetectFailure(result.detectError));
                    setIsError(true);
                } else {
                    setStatus(
                        softDetectFailure(
                            result.detectError ||
                                "No HomeShare window found on this PC yet."
                        )
                    );
                    setIsError(true);
                }
            }
            return false;
        },
        [onDiscoveryUpdated]
    );

    const refreshDiscovery = useCallback(
        async ({ quietFail = false, force = false } = {}) => {
            const now = Date.now();
            if (!force && now - lastDetectAt.current < DETECT_THROTTLE_MS) {
                return;
            }
            lastDetectAt.current = now;

            setChecking(true);
            if (!quietFail) {
                setStatus("");
                setIsError(false);
            }

            try {
                const result = await detectLocalServer();
                await applyDetectResult(result, { quietFail });
            } catch {
                if (!quietFail) {
                    setStatus(
                        "Could not check for HomeShare on this PC. Try again in a moment."
                    );
                    setIsError(true);
                }
            } finally {
                setChecking(false);
            }
        },
        [applyDetectResult]
    );

    const refreshDiscoveryRef = useRef(refreshDiscovery);
    refreshDiscoveryRef.current = refreshDiscovery;

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
        refreshDiscoveryRef.current({ quietFail: true, force: true });

        const onVisibility = () => {
            if (document.visibilityState === "visible") {
                refreshDiscoveryRef.current({ quietFail: true });
            }
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    useEffect(() => {
        if (isLocalActive) {
            loadShareInfo(apiUrl);
        } else {
            setShareInfo(null);
        }
    }, [isLocalActive, apiUrl]);

    const copyText = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopyNote("Copied!");
            setTimeout(() => setCopyNote(""), 2000);
        } catch {
            setCopyNote("Copy failed — select the text and copy manually.");
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
            setStatus(
                "Connected. Next, create an account or log in so you can upload files."
            );
            setIsError(false);
        } catch {
            setStatus(softDetectFailure("Connect to this PC failed."));
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
            setStatus(
                `Connected to ${result.url}. You can log in on this device.`
            );
            setIsError(false);
        } catch (err) {
            setStatus(
                err.message ||
                    "Could not reach that address. Check Wi‑Fi and the number you pasted."
            );
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
                    ? "Switched to Online (Cloud). You can connect to this Wi‑Fi again anytime."
                    : "Could not reach the cloud service right now."
            );
            setIsError(!result.connected);
        } catch (err) {
            setStatus(err.message || "Cloud is not configured in this build.");
            setIsError(true);
        } finally {
            setChecking(false);
        }
    };

    const lanApiUrls =
        shareInfo?.apiUrls?.length > 0
            ? shareInfo.apiUrls
            : shareInfo?.lanIps?.map((ip) => `http://${ip}:8080`) || [];

    const loggedIn = isLoggedIn();

    return (
        <section className="dashboard-page dashboard-page--wide">
            <div className="dashboard-card network-settings-card">
                <div className="network-settings-header">
                    <h2 className="auth-title">Use on this Wi‑Fi</h2>
                    <button type="button" className="files-link-btn" onClick={onBack}>
                        Back
                    </button>
                </div>

                <p className="files-page-intro network-settings-intro">
                    <strong>Online (Cloud)</strong> works from anywhere.{" "}
                    <strong>This Wi‑Fi (Local)</strong> keeps files on a PC in your home or
                    classroom. Set up once on that PC, then everyone on the same Wi‑Fi can use
                    the website.
                </p>

                <div
                    className={`local-setup-status ${
                        isLocalActive
                            ? "local-setup-status--active"
                            : "local-setup-status--inactive"
                    }`}
                >
                    <p>
                        <strong>Status:</strong>{" "}
                        {isLocalActive
                            ? "Connected to this Wi‑Fi"
                            : "Not connected yet — follow the steps below"}
                    </p>
                    {isLocalActive && apiUrl && (
                        <p className="files-muted local-setup-status-url">
                            Server: {apiUrl}
                        </p>
                    )}
                </div>

                <ol className="local-setup-checklist">
                    <li
                        className={`local-setup-check-step ${
                            isLocalActive ? "local-setup-check-step--done" : ""
                        }`}
                    >
                        <h3 className="local-setup-check-title">
                            <span className="local-setup-check-num">1</span>
                            Get a free database link
                        </h3>
                        <p className="files-muted">
                            HomeShare needs a free online database account (MongoDB Atlas) so
                            your local server can remember users and file names. You paste the
                            link into a popup when you first start HomeShare on the PC.
                        </p>
                        <ol className="local-setup-mini-steps">
                            <li>Create a free account and a free cluster.</li>
                            <li>
                                Click <strong>Connect</strong>, then choose the drivers /
                                connection string option.
                            </li>
                            <li>
                                Copy the link and replace the password placeholder with your
                                real database password.
                            </li>
                        </ol>
                        <a
                            className="auth-form__secondary-btn local-setup-external-link"
                            href={ATLAS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Open MongoDB Atlas
                        </a>
                    </li>

                    <li
                        className={`local-setup-check-step ${
                            isLocalActive ? "local-setup-check-step--done" : ""
                        }`}
                    >
                        <h3 className="local-setup-check-title">
                            <span className="local-setup-check-num">2</span>
                            Download and start on this PC
                        </h3>
                        <p className="files-muted">
                            Do this on the <strong>Windows PC</strong> that will keep the files
                            (the teacher’s or family’s host computer).
                        </p>
                        <ol className="local-setup-mini-steps">
                            <li>Download the zip folder below.</li>
                            <li>Unzip it, then double‑click <strong>Start HomeShare.bat</strong>.</li>
                            <li>
                                When the setup window appears, paste your database link, then
                                click Save and start.
                            </li>
                            <li>
                                <strong>Leave the black window open</strong> while you use
                                HomeShare (you can minimize it).
                            </li>
                        </ol>
                        <div className="local-setup-downloads">
                            <a
                                className={`logout-btn local-setup-download-btn local-setup-download-btn--primary ${
                                    zipAvailable === false
                                        ? "local-setup-download-btn--disabled"
                                        : ""
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
                                Download for Windows
                            </a>
                        </div>
                        {zipAvailable === false && (
                            <p className="error local-setup-missing-zip">
                                The download isn’t available on this site yet. Please try again
                                later or ask your administrator.
                            </p>
                        )}
                        {zipAvailable === null && (
                            <p className="files-muted">Checking download…</p>
                        )}
                    </li>

                    <li
                        className={`local-setup-check-step ${
                            isLocalActive ? "local-setup-check-step--complete" : ""
                        }`}
                    >
                        <h3 className="local-setup-check-title">
                            <span className="local-setup-check-num">3</span>
                            Connect this website
                        </h3>
                        <p className="files-muted">
                            Stay on this PC. We look for HomeShare running here automatically.
                            If nothing happens, click Try again.
                        </p>
                        <div className="local-setup-connect-actions">
                            <button
                                type="button"
                                className="logout-btn"
                                onClick={() =>
                                    refreshDiscovery({ quietFail: false, force: true })
                                }
                                disabled={checking}
                            >
                                {checking
                                    ? "Looking…"
                                    : isLocalActive
                                      ? "Connected — check again"
                                      : "Try again"}
                            </button>
                            {!isLocalActive && (
                                <button
                                    type="button"
                                    className="auth-form__secondary-btn"
                                    onClick={handleConnectThisPc}
                                    disabled={checking}
                                >
                                    Connect to this PC
                                </button>
                            )}
                        </div>

                        {isLocalActive && (
                            <div className="local-setup-success-ctas">
                                <p className="success">
                                    You’re connected. Create an account or log in to use the
                                    library on this Wi‑Fi.
                                </p>
                                <div className="local-setup-connect-actions">
                                    {loggedIn ? (
                                        <button
                                            type="button"
                                            className="logout-btn"
                                            onClick={() => onGoToLibrary?.()}
                                        >
                                            Open library
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                className="logout-btn"
                                                onClick={() => onGoToLogin?.()}
                                            >
                                                Log in
                                            </button>
                                            {onGoToRegister && (
                                                <button
                                                    type="button"
                                                    className="auth-form__secondary-btn"
                                                    onClick={() => onGoToRegister()}
                                                >
                                                    Create account
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </li>

                    <li className="local-setup-check-step local-setup-check-step--optional">
                        <button
                            type="button"
                            className="local-setup-disclosure"
                            aria-expanded={otherDevicesOpen}
                            onClick={() => setOtherDevicesOpen((open) => !open)}
                        >
                            <span className="local-setup-check-num">4</span>
                            <span className="local-setup-disclosure-label">
                                Using another computer or phone?{" "}
                                <span className="local-setup-disclosure-hint">
                                    (optional)
                                </span>
                            </span>
                            <span className="local-setup-disclosure-chevron" aria-hidden="true">
                                {otherDevicesOpen ? "▾" : "▸"}
                            </span>
                        </button>

                        {otherDevicesOpen && (
                            <div className="local-setup-disclosure-body">
                                <p className="files-muted">
                                    “Try again” only works on the host PC. On a phone or another
                                    computer, paste the host’s address below instead.
                                </p>

                                {isLocalActive && (
                                    <div className="local-setup-lan-urls">
                                        <h4 className="local-setup-subhead">
                                            Address for other devices
                                        </h4>
                                        {shareInfoLoading && (
                                            <p className="files-muted">Loading address…</p>
                                        )}
                                        {!shareInfoLoading && lanApiUrls.length > 0 && (
                                            <ul className="local-setup-lan-url-list">
                                                {lanApiUrls.map((url) => (
                                                    <li
                                                        key={url}
                                                        className="local-setup-lan-url-row"
                                                    >
                                                        <code className="local-setup-lan-url-text">
                                                            {url}
                                                        </code>
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
                                                Connect on the host PC first so we can show the
                                                Wi‑Fi address to copy.
                                            </p>
                                        )}
                                        {copyNote && (
                                            <p className="files-muted local-setup-copy-note">
                                                {copyNote}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <form
                                    className="local-setup-manual-form"
                                    onSubmit={handleSaveManualUrl}
                                >
                                    <label className="share-modal-label">
                                        Paste the host PC’s address
                                        <input
                                            type="url"
                                            placeholder="http://192.168.x.x:8080"
                                            value={manualUrl}
                                            onChange={(e) => setManualUrl(e.target.value)}
                                        />
                                    </label>
                                    <button
                                        type="submit"
                                        className="auth-form__secondary-btn"
                                        disabled={checking || !manualUrl}
                                    >
                                        Connect with this address
                                    </button>
                                </form>

                                {isLocalActive &&
                                    (shareInfo?.preferredUnc ||
                                        shareInfo?.uncPaths?.[0]) && (
                                        <div className="local-setup-join-folder">
                                            <h4 className="local-setup-subhead">
                                                Windows File Explorer folder (optional)
                                            </h4>
                                            <p className="files-muted">
                                                Most people should use this website’s library.
                                                On Windows you can also open the shared folder if
                                                your school or home network allows it.
                                            </p>
                                            <p className="local-setup-unc">
                                                <code>
                                                    {shareInfo.preferredUnc ||
                                                        shareInfo.uncPaths[0]}
                                                </code>
                                            </p>
                                            <button
                                                type="button"
                                                className="auth-form__secondary-btn"
                                                onClick={() =>
                                                    copyText(
                                                        shareInfo.preferredUnc ||
                                                            shareInfo.uncPaths[0]
                                                    )
                                                }
                                            >
                                                Copy folder path
                                            </button>
                                            {!shareInfo.enabled && shareInfo.message && (
                                                <p className="error">{shareInfo.message}</p>
                                            )}
                                            {shareInfo.joinSteps?.length > 0 && (
                                                <ol className="local-setup-join-steps">
                                                    {shareInfo.joinSteps.map((step) => (
                                                        <li key={step}>{step}</li>
                                                    ))}
                                                </ol>
                                            )}
                                        </div>
                                    )}
                            </div>
                        )}
                    </li>
                </ol>

                {process.env.REACT_APP_API_URL && (
                    <div className="local-setup-cloud-switch">
                        <button
                            type="button"
                            className="share-revoke-btn"
                            onClick={handleUseCloud}
                            disabled={checking}
                        >
                            Switch back to Online (Cloud)
                        </button>
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
