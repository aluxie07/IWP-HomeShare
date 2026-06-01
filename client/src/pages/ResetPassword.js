import { useEffect, useState } from "react";
import AuthHeader from "../components/AuthHeader";
import GradientPageLayout from "../components/GradientPageLayout";
import { API_URL } from "../utils/api";
import { PASSWORD_PATTERN, PASSWORD_RULE } from "../constants/password";

function ResetPassword({ token, onGoToLogin }) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [tokenValid, setTokenValid] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!token) {
            setTokenValid(false);
            return;
        }

        let cancelled = false;

        const validate = async () => {
            try {
                const res = await fetch(
                    `${API_URL}/reset-password/validate?token=${encodeURIComponent(token.trim())}`
                );
                const data = await res.json();
                if (!cancelled) {
                    setTokenValid(res.ok && data.valid);
                    if (!res.ok) {
                        setError(data.message || "Invalid or expired reset link.");
                    }
                }
            } catch {
                if (!cancelled) {
                    setTokenValid(false);
                    setError("Could not reach server. Is the backend running?");
                }
            }
        };

        validate();

        return () => {
            cancelled = true;
        };
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch(`${API_URL}/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: token.trim(), password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || "Could not reset password");
                return;
            }

            setSuccess(data.message || "Password updated successfully.");
        } catch {
            setError("Could not reach server. Is the backend running?");
        } finally {
            setSubmitting(false);
        }
    };

    if (tokenValid === null) {
        return (
            <GradientPageLayout>
                <div className="auth-card">
                    <div className="auth-form">
                        <AuthHeader title="Reset password" />
                        <p className="auth-form__hint">Checking your reset link…</p>
                    </div>
                </div>
            </GradientPageLayout>
        );
    }

    if (tokenValid === false) {
        return (
            <GradientPageLayout>
                <div className="auth-card">
                    <div className="auth-form">
                        <AuthHeader title="Reset password" />
                        <p className="error">{error || "Invalid or expired reset link."}</p>
                        <button type="button" className="auth-form__secondary-btn" onClick={onGoToLogin}>
                            Back to login
                        </button>
                    </div>
                </div>
            </GradientPageLayout>
        );
    }

    return (
        <GradientPageLayout>
            <div className="auth-card">
                <form className="auth-form" onSubmit={handleSubmit}>
                    <AuthHeader title="Reset password" />
                    <p className="auth-form__hint">Enter your new password below.</p>
                    <input
                        type="password"
                        placeholder="New password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        pattern={PASSWORD_PATTERN}
                        title={PASSWORD_RULE}
                    />
                    <input
                        type="password"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                    <button type="submit" disabled={submitting || !!success}>
                        {submitting ? "Saving…" : "Reset password"}
                    </button>
                    <div className="message-area">
                        {success && <p className="success">{success}</p>}
                        {error && <p className="error">{error}</p>}
                    </div>
                    {success && (
                        <button
                            type="button"
                            className="auth-form__secondary-btn"
                            onClick={onGoToLogin}
                        >
                            Go to login
                        </button>
                    )}
                </form>
            </div>
        </GradientPageLayout>
    );
}

export default ResetPassword;
