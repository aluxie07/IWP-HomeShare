import { useState } from "react";
import AuthHeader from "../components/AuthHeader";
import GradientPageLayout from "../components/GradientPageLayout";
import { API_URL } from "../utils/api";

function ForgotPassword({ onBackToLogin }) {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setSubmitting(true);

        try {
            const res = await fetch(`${API_URL}/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || "Could not send reset email");
                return;
            }

            setSuccess(
                data.message ||
                    "If an account exists for this email, a password reset link was sent."
            );
        } catch {
            setError("Could not reach server. Is the backend running?");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <GradientPageLayout>
            <div className="auth-card">
                <form className="auth-form" onSubmit={handleSubmit}>
                    <AuthHeader title="Forgot password" />
                    <p className="auth-form__hint">
                        Enter the email you used to register. We will send you a link
                        to reset your password.
                    </p>
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <button type="submit" disabled={submitting}>
                        {submitting ? "Sending…" : "Send reset link"}
                    </button>
                    <div className="message-area">
                        {success && <p className="success">{success}</p>}
                        {error && <p className="error">{error}</p>}
                    </div>
                </form>
            </div>
            <p className="nav-links nav-links--on-gradient">
                <button type="button" onClick={onBackToLogin}>
                    Back to login
                </button>
            </p>
        </GradientPageLayout>
    );
}

export default ForgotPassword;
