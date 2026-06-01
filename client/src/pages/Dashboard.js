import { useEffect, useState } from "react";
import { API_URL } from "../utils/api";
import { getToken, getUser } from "../utils/authStorage";

function Dashboard({
    onRedirectToLogin,
    onLogout,
    onDeleteAccount,
    onGoToUpload,
    onGoToLibrary,
}) {
    const [message, setMessage] = useState("");
    const [user, setUser] = useState(() => getUser());
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
                const res = await fetch(`${API_URL}/dashboard`, {
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
                            </div>
                        )}
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
