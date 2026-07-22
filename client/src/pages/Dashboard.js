import { useEffect, useMemo, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import {
    apiFetch,
    formatUploadDate,
    getNetworkErrorMessage,
} from "../utils/api";
import {
    getUser,
    saveAuth,
    clearAuth,
    getActiveApiSlot,
    getLibraryLinkStatus,
} from "../utils/authStorage";
import { getApiMode } from "../utils/apiDiscovery";

function isLocalApiMode(mode = getApiMode()) {
    return mode === "local" || mode === "manual";
}

function summarizeFiles(files) {
    const active = (files || []).filter((file) => !file.deleted);
    active.sort(
        (a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
    );

    return {
        activeCount: active.length,
        sharedCount: active.filter((file) => Boolean(file.share)).length,
        localOnlyCount: active.filter(
            (file) => (file.accessMode || "private") === "local_only"
        ).length,
        recent: active.slice(0, 5),
    };
}

function pickNextStepTip({ isLocal, activeCount, statsReady }) {
    if (statsReady && activeCount === 0) {
        return {
            text: "You have not uploaded any files yet. Start with Upload file.",
            action: "upload",
            actionLabel: "Upload file",
        };
    }
    if (isLocal) {
        return {
            text: "Keep the black HomeShare window open on this PC while you use This Wi‑Fi (minimize is OK).",
            action: null,
            actionLabel: null,
        };
    }
    return null;
}

function Dashboard({
    onRedirectToLogin,
    onLogout,
    onDeleteAccount,
    onGoToUpload,
    onGoToLibrary,
    onGoToLocalSetup,
}) {
    const [user, setUser] = useState(() => getUser());
    const [network, setNetwork] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        activeCount: null,
        sharedCount: null,
        localOnlyCount: null,
        recent: [],
    });
    const [statsReady, setStatsReady] = useState(false);

    const apiMode = getApiMode();
    const isLocal = isLocalApiMode(apiMode);
    const modeLabel = isLocal ? "This Wi‑Fi" : "Online";
    const linkStatus = getLibraryLinkStatus();

    const nextTip = useMemo(
        () =>
            pickNextStepTip({
                isLocal,
                activeCount: stats.activeCount || 0,
                statsReady,
            }),
        [isLocal, stats.activeCount, statsReady]
    );

    useEffect(() => {
        async function loadDashboard() {
            try {
                const res = await apiFetch("/dashboard");
                const data = await res.json();

                if (res.status === 401) {
                    clearAuth(getActiveApiSlot());
                    onRedirectToLogin();
                    return;
                }

                if (!res.ok) {
                    setError(data.message || "Failed to load dashboard");
                    return;
                }

                if (data.user) {
                    setUser(data.user);
                    saveAuth(data.user, null, getActiveApiSlot());
                }
                if (data.network) {
                    setNetwork(data.network);
                }
            } catch (err) {
                setError(getNetworkErrorMessage(err));
            } finally {
                setLoading(false);
            }
        }

        async function loadFileSummary() {
            try {
                const res = await apiFetch("/files", { cache: "no-store" });
                if (res.status === 401) {
                    return;
                }
                if (!res.ok) {
                    setStatsReady(true);
                    return;
                }
                const data = await res.json();
                setStats(summarizeFiles(data.files || []));
            } catch {
                // Soft-fail: keep dashes / empty recent
            } finally {
                setStatsReady(true);
            }
        }

        loadDashboard();
        loadFileSummary();
    }, [onRedirectToLogin]);

    const handleLogout = async () => {
        try {
            await apiFetch("/logout", { method: "POST" });
        } catch {
            // Clear local state even if the network call fails
        }
        clearAuth(getActiveApiSlot());
        onLogout?.();
    };

    const formatStat = (value) =>
        statsReady && value != null ? String(value) : "—";

    const showLinkTip = Boolean(linkStatus?.message && !linkStatus.linked);

    return (
        <section className="dashboard-page dashboard-page--home">
            <div className="dashboard-card dashboard-card--home">
                {loading && <p className="files-muted">Loading…</p>}
                {error && <p className="error">{error}</p>}
                {!loading && !error && (
                    <>
                        <header className="dashboard-home-header">
                            <h2 className="auth-title dashboard-home-title">
                                Hi{user?.username ? `, ${user.username}` : ""}
                            </h2>
                            {user && (
                                <p className="dashboard-account-line">
                                    {user.email}
                                    {user.role === "admin" ? " · Administrator" : ""}
                                </p>
                            )}
                        </header>

                        <div
                            className={`dashboard-mode-strip ${
                                isLocal
                                    ? "dashboard-mode-strip--local"
                                    : "dashboard-mode-strip--cloud"
                            }`}
                        >
                            <div className="dashboard-mode-strip__main">
                                <span className="dashboard-mode-badge">{modeLabel}</span>
                                <p className="dashboard-mode-strip__text">
                                    {isLocal
                                        ? "Files stay on this PC’s HomeShare folder for people on the same Wi‑Fi."
                                        : "Files are stored online and work from anywhere with internet."}
                                </p>
                            </div>
                            <div className="dashboard-mode-strip__network">
                                <NetworkStatusIndicator
                                    compact
                                    initialStatus={
                                        network
                                            ? {
                                                  clientIp: network.clientIp,
                                                  message:
                                                      "Local Only files are limited to the uploader's IP range (same Wi‑Fi / LAN).",
                                              }
                                            : null
                                    }
                                />
                            </div>
                        </div>

                        {showLinkTip && (
                            <div className="dashboard-tip dashboard-tip--link" role="status">
                                <p>{linkStatus.message}</p>
                                {onGoToLocalSetup &&
                                    linkStatus.reason === "missing_local" && (
                                        <button
                                            type="button"
                                            className="files-link-btn"
                                            onClick={onGoToLocalSetup}
                                        >
                                            Use on this Wi‑Fi
                                        </button>
                                    )}
                            </div>
                        )}

                        {nextTip && (
                            <div className="dashboard-tip dashboard-tip--next" role="status">
                                <p>{nextTip.text}</p>
                                {nextTip.action === "upload" && (
                                    <button
                                        type="button"
                                        className="files-link-btn"
                                        onClick={onGoToUpload}
                                    >
                                        {nextTip.actionLabel}
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="dashboard-stats" aria-label="Library summary">
                            <div className="dashboard-stat">
                                <span className="dashboard-stat__value">
                                    {formatStat(stats.activeCount)}
                                </span>
                                <span className="dashboard-stat__label">Your files</span>
                            </div>
                            <div className="dashboard-stat">
                                <span className="dashboard-stat__value">
                                    {formatStat(stats.sharedCount)}
                                </span>
                                <span className="dashboard-stat__label">Shared links</span>
                            </div>
                            <div className="dashboard-stat">
                                <span className="dashboard-stat__value">
                                    {formatStat(stats.localOnlyCount)}
                                </span>
                                <span className="dashboard-stat__label">LAN only</span>
                            </div>
                        </div>

                        <div className="dashboard-recent">
                            <div className="dashboard-recent__header">
                                <h3 className="dashboard-section-title">Recent files</h3>
                                <button
                                    type="button"
                                    className="files-link-btn"
                                    onClick={onGoToLibrary}
                                >
                                    Open library
                                </button>
                            </div>
                            {!statsReady && (
                                <p className="files-muted">Loading recent files…</p>
                            )}
                            {statsReady && stats.recent.length === 0 && (
                                <p className="files-muted">No files yet.</p>
                            )}
                            {stats.recent.length > 0 && (
                                <ul className="dashboard-recent__list">
                                    {stats.recent.map((file) => (
                                        <li key={file.id}>
                                            <button
                                                type="button"
                                                className="dashboard-recent__item"
                                                onClick={onGoToLibrary}
                                            >
                                                <span
                                                    className="dashboard-recent__name"
                                                    title={file.filename}
                                                >
                                                    {file.filename}
                                                </span>
                                                <span className="dashboard-recent__meta">
                                                    {formatUploadDate(file.uploadDate)}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="dashboard-action-tiles">
                            <button
                                type="button"
                                className="dashboard-action-tile dashboard-action-tile--primary"
                                onClick={onGoToUpload}
                            >
                                Upload file
                            </button>
                            <button
                                type="button"
                                className="dashboard-action-tile"
                                onClick={onGoToLibrary}
                            >
                                File library
                            </button>
                            {onGoToLocalSetup && (
                                <button
                                    type="button"
                                    className="dashboard-action-tile"
                                    onClick={onGoToLocalSetup}
                                >
                                    Use on this Wi‑Fi
                                </button>
                            )}
                        </div>
                    </>
                )}

                <div className="dashboard-actions dashboard-actions--secondary">
                    <button type="button" className="logout-btn" onClick={handleLogout}>
                        Logout
                    </button>
                    <button
                        type="button"
                        className="delete-account-link-btn"
                        onClick={onDeleteAccount}
                    >
                        Delete account
                    </button>
                </div>
            </div>
        </section>
    );
}

export default Dashboard;
