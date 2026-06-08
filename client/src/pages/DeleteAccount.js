import { useState } from "react";
import { getApiUrl } from "../utils/api";
import { clearAuth, getToken } from "../utils/authStorage";

function DeleteAccount({ onCancel, onAccountDeleted }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        const token = getToken();
        if (!token) {
            onAccountDeleted();
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch(`${getApiUrl()}/account`, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ password }),
            });

            const data = await res.json();

            if (res.status === 401) {
                if (data.message === "Unauthorized") {
                    clearAuth();
                    onAccountDeleted();
                    return;
                }
                setError(data.message || "Incorrect password");
                return;
            }

            if (!res.ok) {
                setError(data.message || "Could not delete account");
                return;
            }

            clearAuth();
            onAccountDeleted(data.message);
        } catch {
            setError("Could not reach server. Is the backend running?");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="dashboard-page">
            <div className="dashboard-card">
                <h2 className="auth-title">Delete account</h2>
                <p className="delete-account-warning">
                    This action is permanent. Your account and login credentials
                    will be removed and cannot be recovered.
                </p>
                <form className="auth-form delete-account-form" onSubmit={handleSubmit}>
                    <label className="delete-account-label" htmlFor="delete-password">
                        Enter your password to confirm
                    </label>
                    <input
                        id="delete-password"
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                    />
                    <div className="message-area">
                        {error && <p className="error">{error}</p>}
                    </div>
                    <div className="dashboard-actions">
                        <button
                            type="submit"
                            className="delete-account-btn"
                            disabled={submitting}
                        >
                            {submitting ? "Deleting…" : "Delete my account"}
                        </button>
                        <button
                            type="button"
                            className="auth-form__secondary-btn"
                            onClick={onCancel}
                            disabled={submitting}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </section>
    );
}

export default DeleteAccount;
