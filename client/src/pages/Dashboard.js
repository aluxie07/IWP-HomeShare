import { useEffect, useState } from "react";
import NetworkStatusIndicator from "../components/NetworkStatusIndicator";
import { getApiUrl } from "../utils/api";
import { getToken, getUser, saveAuth } from "../utils/authStorage";

function Dashboard({
    onRedirectToLogin,
    onLogout,
    onDeleteAccount,
    onGoToUpload,
    onGoToLibrary,
    onGoToNetworkSettings,
}) {
    const [message, setMessage] = useState("");
    const [user, setUser] = useState(() => getUser());
    const [network, setNetwork] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = getToken();

        if (!token) {
            onRedirectToLogin();
            return;
        }

        async function loadDashboard() {
            try {
                const res = await fetch(`${getApiUrl()}/dashboard`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const data = await res.json();

                if (res.status === 401) {
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
                    saveAuth(token, data.user);
                }
                if (data.network) {
                    setNetwork(data.network);
                }
            } catch {
                setError("Could not reach server. Is the backend running?");
            } finally {
                setLoading(false);
            }
        }

        loadDashboard();
    }, [onRedirectToLogin]);

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
                            <h3 className="dashboard-network-title">Local network status</h3>
                            <NetworkStatusIndicator
                                initialStatus={
                                    network
                                        ? {
                                              configured: network.configured,
                                              isTrustedNetwork: network.isTrustedNetwork,
                                              accessLevel: network.accessLevel,
                                              clientIp: network.clientIp,
                                              trustedNetwork: null,
                                              capabilities: {
                                                  localOnlyAccess:
                                                      network.configured &&
                                                      network.isTrustedNetwork,
                                                  sharedAccess: true,
                                                  privateAccess: true,
                                              },
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
                </div>
                {user?.role === "admin" && (
                    <button
                        type="button"
                        className="auth-form__secondary-btn dashboard-network-settings-btn"
                        onClick={onGoToNetworkSettings}
                    >
                        Manage trusted network
                    </button>
                )}
                <div className="dashboard-actions">
                    <button type="button" className="logout-btn" onClick={onLogout}>
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
