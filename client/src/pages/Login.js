import { useState } from "react";
import AuthHeader from "../components/AuthHeader";
import GradientPageLayout from "../components/GradientPageLayout";
import RecaptchaField from "../components/RecaptchaField";
import { saveAuth } from "../utils/authStorage";

import { apiFetch, getNetworkErrorMessage } from "../utils/api";

function Login({ onLoginSuccess, onSwitchToRegister, onForgotPassword }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [needsVerification, setNeedsVerification] = useState(false);
    const [resendMessage, setResendMessage] = useState("");
    const [recaptchaToken, setRecaptchaToken] = useState(null);
    const [recaptchaKey, setRecaptchaKey] = useState(0);

    const resetRecaptcha = () => {
        setRecaptchaToken(null);
        setRecaptchaKey((k) => k + 1);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setNeedsVerification(false);
        setResendMessage("");

        if (!recaptchaToken) {
            setError("Please complete the reCAPTCHA verification");
            return;
        }

        try {
            const res = await apiFetch("/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, recaptchaToken }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || "Invalid credentials");
                if (data.code === "EMAIL_NOT_VERIFIED") {
                    setNeedsVerification(true);
                }
                resetRecaptcha();
                return;
            }

            if (data.token) {
                saveAuth(data.token, {
                    username: data.username,
                    email,
                });
            }

            setSuccess(data.message || "Login successful");
            onLoginSuccess?.();
        } catch (err) {
            setError(getNetworkErrorMessage(err));
            resetRecaptcha();
        }
    };

    const handleResendVerification = async () => {
        setResendMessage("");
        if (!email) {
            setResendMessage("Enter your email above, then resend the activation link.");
            return;
        }

        try {
            const res = await apiFetch("/resend-verification", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            setResendMessage(data.message || "Request sent.");
        } catch (err) {
            setResendMessage(getNetworkErrorMessage(err));
        }
    };

    return (
        <GradientPageLayout>
            <div className="auth-card">
                <form className="auth-form" onSubmit={handleLogin}>
                    <AuthHeader title="Login" />
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <button
                        type="button"
                        className="forgot-password-link"
                        onClick={onForgotPassword}
                    >
                        Forgot password?
                    </button>
                    <RecaptchaField
                        key={recaptchaKey}
                        onTokenChange={setRecaptchaToken}
                    />
                    <button type="submit">Login</button>
                    <div className="message-area">
                        {success && <p className="success">{success}</p>}
                        {error && <p className="error">{error}</p>}
                        {needsVerification && (
                            <button
                                type="button"
                                className="resend-verification-btn"
                                onClick={handleResendVerification}
                            >
                                Resend activation email
                            </button>
                        )}
                        {resendMessage && (
                            <p className="resend-verification-msg">{resendMessage}</p>
                        )}
                    </div>
                </form>
            </div>
            <p className="nav-links nav-links--on-gradient">
                <button type="button" onClick={onSwitchToRegister}>
                    Create an account
                </button>
            </p>
        </GradientPageLayout>
    );
}

export default Login;
