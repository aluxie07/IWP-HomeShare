import { useEffect, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import { apiFetch, getNetworkErrorMessage } from "../utils/api";
import {
    getUser,
    saveAuth,
    clearAuth,
    getActiveApiSlot,
} from "../utils/authStorage";

function Dashboard({
    onRedirectToLogin,
    onLogout,
    onDeleteAccount,
    onGoToUpload,
    onGoToLibrary,
    onGoToLocalSetup,
}) {
    const [message, setMessage] = useState("");
    const [user, setUser] = useState(() => getUser());
    const [network, setNetwork] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

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

                setMessage(data.message);
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

        loadDashboard();
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

    return (
        <section className="dashboard-page">
            <div className="dashboard-card">
                <h2 className="auth-title">Dashboard</h2>
                {loading && <p>Loading...</p>}
                {error && <p className="error">{error}</p>}
                {!loading && !error && (
                    <>
                        <p className="dashboard-message">{message}</p>
                        {user && (
                            <div className="dashboard-user">
                                <p>
                                    <strong>Username:</strong> {user.username}
                                </p>
                                <p>
                                    <strong>Email:</strong> {user.email}
                                </p>
                                {user.role === "admin" && (
                                    <p>
                                        <strong>Role:</strong> Administrator
                                    </p>
                                )}
                            </div>
                        )}
                        <div className="dashboard-network-panel">
                            <h3 className="dashboard-network-title">Connection</h3>
                            <NetworkStatusIndicator
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
                    </>
                )}
                <div className="dashboard-file-links">
                    <button type="button" className="logout-btn" onClick={onGoToUpload}>
                        Upload file
                    </button>
                    <button
                        type="button"
                        className="auth-form__secondary-btn"
                        onClick={onGoToLibrary}
                    >
                        File library
                    </button>
                    {onGoToLocalSetup && (
                        <button
                            type="button"
                            className="auth-form__secondary-btn"
                            onClick={onGoToLocalSetup}
                        >
                            Local Network setup
                        </button>
                    )}
                </div>
                <div className="dashboard-actions">
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
