import { useEffect, useState } from "react";
import AuthHeader from "../components/AuthHeader";
import GradientPageLayout from "../components/GradientPageLayout";
import RecaptchaField from "../components/RecaptchaField";
import { saveAuth } from "../utils/authStorage";
import { apiFetch, getApiUrl, getNetworkErrorMessage } from "../utils/api";
import { getApiMode, getCloudApiUrl, switchToCloudApi } from "../utils/apiDiscovery";

function isLocalApiUrl(url) {
    try {
        const host = new URL(url).hostname;
        return host === "localhost" || host === "127.0.0.1" || host === "::1";
    } catch {
        return false;
    }
}

function shouldSkipRecaptcha() {
    const mode = getApiMode();
    if (mode === "local" || mode === "manual") {
        return true;
    }
    return isLocalApiUrl(getApiUrl());
}

function Login({ onLoginSuccess, onSwitchToRegister, onForgotPassword, onApiModeChanged }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [needsVerification, setNeedsVerification] = useState(false);
    const [resendMessage, setResendMessage] = useState("");
    const [recaptchaToken, setRecaptchaToken] = useState(null);
    const [recaptchaKey, setRecaptchaKey] = useState(0);
    const [recaptchaRequired, setRecaptchaRequired] = useState(false);
    const [switchingCloud, setSwitchingCloud] = useState(false);

    const showUseCloud =
        Boolean(getCloudApiUrl()) &&
        (getApiMode() === "local" ||
            getApiMode() === "manual" ||
            isLocalApiUrl(getApiUrl()));

    useEffect(() => {
        let cancelled = false;

        if (shouldSkipRecaptcha()) {
            setRecaptchaRequired(false);
            return undefined;
        }

        fetch(`${getApiUrl()}/health`)
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) {
                    return;
                }
                if (typeof data.recaptchaRequired === "boolean") {
                    setRecaptchaRequired(data.recaptchaRequired);
                } else {
                    setRecaptchaRequired(true);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setRecaptchaRequired(!shouldSkipRecaptcha());
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const resetRecaptcha = () => {
        setRecaptchaToken(null);
        setRecaptchaKey((k) => k + 1);
    };

    const handleUseCloud = async () => {
        setSwitchingCloud(true);
        setError("");
        try {
            const result = await switchToCloudApi();
            onApiModeChanged?.(result);
            setSuccess("Switched to cloud API. You can log in now.");
            setRecaptchaRequired(true);
            resetRecaptcha();
        } catch (err) {
            setError(err.message || "Could not switch to cloud API");
        } finally {
            setSwitchingCloud(false);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setNeedsVerification(false);
        setResendMessage("");

        const needsCaptcha = recaptchaRequired && !shouldSkipRecaptcha();

        if (needsCaptcha && !recaptchaToken) {
            setError("Please complete the reCAPTCHA verification");
            return;
        }

        try {
            const res = await apiFetch("/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password,
                    ...(needsCaptcha ? { recaptchaToken } : {}),
                }),
            });

            const data = await res.json();

            if (res.ok) {
                saveAuth(
                    {
                        username: data.username,
                        email: data.email || email,
                        role: data.role || "user",
                    },
                    data.token || null
                );
            } else {
                setError(data.message || "Invalid credentials");
                if (data.code === "EMAIL_NOT_VERIFIED") {
                    setNeedsVerification(true);
                }
                if (needsCaptcha) {
                    resetRecaptcha();
                }
                return;
            }

            setSuccess(data.message || "Login successful");
            onLoginSuccess?.();
        } catch (err) {
            setError(getNetworkErrorMessage(err));
            if (needsCaptcha) {
                resetRecaptcha();
            }
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

    const showCaptcha = recaptchaRequired && !shouldSkipRecaptcha();

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
                    {showCaptcha && (
                        <RecaptchaField
                            key={recaptchaKey}
                            onTokenChange={setRecaptchaToken}
                        />
                    )}
                    <button type="submit">Login</button>
                    {showUseCloud && (
                        <button
                            type="button"
                            className="auth-form__secondary-btn"
                            onClick={handleUseCloud}
                            disabled={switchingCloud}
                        >
                            {switchingCloud ? "Switching…" : "Use cloud API instead"}
                        </button>
                    )}
                    <div className="message-area">
                        {success && <p className="success">{success}</p>}
                        {error && <p className="error">{error}</p>}
                        {showUseCloud && error && (
                            <p className="files-muted">
                                No local server is required for normal login. Use the cloud
                                API button above.
                            </p>
                        )}
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
