import { useEffect, useMemo, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import {
    apiFetch,
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
import { resolveStorageScope } from "../utils/fileStorageScope";

function isLocalApiMode(mode = getApiMode()) {
    return mode === "local" || mode === "manual";
}

function shortFileType(file) {
    const name = file?.filename || "";
    const dot = name.lastIndexOf(".");
    if (dot < 0) {
        return "FILE";
    }
    const ext = name.slice(dot + 1).toUpperCase();
    return ext.slice(0, 4) || "FILE";
}

function formatRecentDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startToday - startThat) / 86400000);
    if (diffDays === 0) {
        return "Today";
    }
    if (diffDays === 1) {
        return "Yesterday";
    }
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
            text: "You have not uploaded any files yet. Start with Upload a file.",
            action: "upload",
            actionLabel: "Upload a file",
        };
    }
    if (isLocal) {
        return {
            text: "Keep the host window open on this PC — closing it disconnects everyone on this Wi‑Fi.",
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
    const modeLabel = isLocal ? "THIS WI‑FI" : "ONLINE";
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
    const tip = showLinkTip
        ? {
              text: linkStatus.message,
              action:
                  onGoToLocalSetup && linkStatus.reason === "missing_local"
                      ? "local"
                      : null,
              actionLabel: "Use on this Wi‑Fi",
          }
        : nextTip;

    return (
        <section className="dashboard-page dashboard-page--home">
            <div className="dash-card">
                {loading && <p className="files-muted">Loading…</p>}
                {error && <p className="error">{error}</p>}
                {!loading && !error && (
                    <>
                        <div className="dash-greet-row">
                            <div>
                                <h2 className="auth-title dash-auth-title">
                                    Hi{user?.username ? `, ${user.username}` : ""}
                                </h2>
                                {user && (
                                    <p className="dashboard-account-line">
                                        {user.email}
                                    </p>
                                )}
                            </div>
                            {user?.role === "admin" && (
                                <span className="dash-admin-pill">Admin</span>
                            )}
                        </div>

                        <div
                            className={`dash-mode-strip ${
                                isLocal ? "dash-mode-strip--local" : ""
                            }`}
                        >
                            <div className="dash-mode-top">
                                <span className="dash-mode-badge">
                                    <span className="dash-mode-badge__dot" aria-hidden="true" />
                                    {modeLabel}
                                </span>
                            </div>
                            <p className="dash-mode-text">
                                {isLocal ? (
                                    <>
                                        You&apos;re viewing the{" "}
                                        <strong>local library</strong> on this network.
                                        Files stay on the host PC.
                                    </>
                                ) : (
                                    <>
                                        You&apos;re viewing your{" "}
                                        <strong>cloud library</strong>. Files here are
                                        reachable from any device, anywhere.
                                    </>
                                )}
                            </p>
                            <div className="dash-net-status">
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

                            {tip && (
                                <div className="dash-tip-banner" role="status">
                                    <span className="dash-tip-banner__ic" aria-hidden="true">
                                        ✦
                                    </span>
                                    <span>
                                        {tip.text}
                                        {tip.action === "upload" && (
                                            <>
                                                {" "}
                                                <button
                                                    type="button"
                                                    className="dash-tip-link"
                                                    onClick={onGoToUpload}
                                                >
                                                    {tip.actionLabel}
                                                </button>
                                            </>
                                        )}
                                        {tip.action === "local" && (
                                            <>
                                                {" "}
                                                <button
                                                    type="button"
                                                    className="dash-tip-link"
                                                    onClick={onGoToLocalSetup}
                                                >
                                                    {tip.actionLabel}
                                                </button>
                                            </>
                                        )}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="dash-stats" aria-label="Library summary">
                            <div className="dash-stat-cell">
                                <p className="dash-stat-value">{formatStat(stats.activeCount)}</p>
                                <p className="dash-stat-label">Your files</p>
                            </div>
                            <div className="dash-stat-cell">
                                <p className="dash-stat-value">{formatStat(stats.sharedCount)}</p>
                                <p className="dash-stat-label">Shared links</p>
                            </div>
                            <div className="dash-stat-cell">
                                <p className="dash-stat-value">
                                    {formatStat(stats.localOnlyCount)}
                                </p>
                                <p className="dash-stat-label">LAN only</p>
                            </div>
                        </div>

                        <div className="dash-section-head">
                            <h3>Recent files</h3>
                            <button
                                type="button"
                                className="dash-open-lib-link"
                                onClick={onGoToLibrary}
                            >
                                Open library →
                            </button>
                        </div>

                        {!statsReady && (
                            <p className="files-muted">Loading recent files…</p>
                        )}
                        {statsReady && stats.recent.length === 0 && (
                            <p className="files-muted">No files yet.</p>
                        )}
                        {stats.recent.length > 0 && (
                            <div className="dash-recent-list">
                                {stats.recent.map((file) => {
                                    const scope = resolveStorageScope(file, {
                                        preferLocal: isLocal,
                                    });
                                    return (
                                        <button
                                            key={file.id}
                                            type="button"
                                            className="dash-recent-row"
                                            onClick={onGoToLibrary}
                                        >
                                            <span
                                                className={`dash-rf-icon ${
                                                    scope === "local" ? "dash-rf-icon--local" : ""
                                                }`}
                                            >
                                                {shortFileType(file)}
                                            </span>
                                            <span
                                                className="dash-rf-name"
                                                title={file.filename}
                                            >
                                                {file.filename}
                                            </span>
                                            <span className="dash-rf-date">
                                                {formatRecentDate(file.uploadDate)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <div className="dash-actions dashboard-action-tiles">
                            <button
                                type="button"
                                className="dashboard-action-tile dashboard-action-tile--primary"
                                onClick={onGoToUpload}
                            >
                                Upload a file
                            </button>
                            <button
                                type="button"
                                className="dashboard-action-tile"
                                onClick={onGoToLibrary}
                            >
                                Library
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
