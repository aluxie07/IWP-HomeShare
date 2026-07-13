import { useEffect, useState } from "react";
import AuthHeader from "../components/AuthHeader";
import GradientPageLayout from "../components/GradientPageLayout";
import RecaptchaField from "../components/RecaptchaField";
import { apiFetch, getApiUrl, getNetworkErrorMessage } from "../utils/api";
import { getApiMode } from "../utils/apiDiscovery";
import { PASSWORD_PATTERN, PASSWORD_RULE } from "../constants/password";

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

function Register({ onSwitchToLogin }) {
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [recaptchaToken, setRecaptchaToken] = useState(null);
    const [recaptchaKey, setRecaptchaKey] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [recaptchaRequired, setRecaptchaRequired] = useState(false);

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

    const handleRegister = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        const needsCaptcha = recaptchaRequired && !shouldSkipRecaptcha();

        if (needsCaptcha && !recaptchaToken) {
            setError("Please complete the reCAPTCHA verification");
            return;
        }

        if (submitting) {
            return;
        }

        setSubmitting(true);

        try {
            const res = await apiFetch("/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    email,
                    password,
                    ...(needsCaptcha ? { recaptchaToken } : {}),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || "Registration failed");
                if (needsCaptcha) {
                    resetRecaptcha();
                }
                return;
            }

            setSuccess(data.message || "User registered successfully");
            if (needsCaptcha) {
                resetRecaptcha();
            }
        } catch (err) {
            setError(getNetworkErrorMessage(err));
            if (needsCaptcha) {
                resetRecaptcha();
            }
        } finally {
            setSubmitting(false);
        }
    };

    const showCaptcha = recaptchaRequired && !shouldSkipRecaptcha();

    return (
        <GradientPageLayout>
            <div className="auth-card">
                <form className="auth-form" onSubmit={handleRegister}>
                    <AuthHeader title="Register" />
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />
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
                        minLength={8}
                        pattern={PASSWORD_PATTERN}
                        title={PASSWORD_RULE}
                    />
                    <input
                        type="password"
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                    {showCaptcha && (
                        <RecaptchaField
                            key={recaptchaKey}
                            onTokenChange={setRecaptchaToken}
                        />
                    )}
                    <button type="submit" disabled={submitting}>
                        {submitting ? "Registering…" : "Register"}
                    </button>
                    <div className="message-area">
                        {success && <p className="success">{success}</p>}
                        {error && <p className="error">{error}</p>}
                    </div>
                </form>
            </div>
            <p className="nav-links nav-links--on-gradient">
                <button type="button" onClick={onSwitchToLogin}>
                    Already have an account? Login
                </button>
            </p>
        </GradientPageLayout>
    );
}

export default Register;
