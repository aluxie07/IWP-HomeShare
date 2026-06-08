import { useEffect, useState } from "react";
import GradientPageLayout from "../components/GradientPageLayout";
import { getApiUrl } from "../utils/api";

function ActivateAccount({ token, onGoToLogin }) {
    const [status, setStatus] = useState("loading");
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        if (!token) {
            setStatus("missing");
            return;
        }

        let cancelled = false;

        const verify = async () => {
            try {
                const res = await fetch(
                    `${getApiUrl()}/verify-email?token=${encodeURIComponent(token.trim())}`
                );
                const data = await res.json();

                if (cancelled) {
                    return;
                }

                if (!res.ok) {
                    setErrorMessage(
                        data.message ||
                            "This link is invalid or has expired. Request a new activation email from the login page."
                    );
                    setStatus("error");
                    return;
                }

                setStatus("success");
            } catch {
                if (cancelled) {
                    return;
                }
                setErrorMessage("Could not reach server. Is the backend running?");
                setStatus("error");
            }
        };

        verify();

        return () => {
            cancelled = true;
        };
    }, [token]);

    return (
        <GradientPageLayout>
            <div className="auth-card">
                <div className="activate-page">
                    {status === "loading" && (
                        <>
                            <h1 className="activate-page__title">Activating your account</h1>
                            <p className="activate-page__text">
                                Please wait while we verify your email…
                            </p>
                        </>
                    )}

                    {status === "success" && (
                        <>
                            <div className="activate-page__icon" aria-hidden="true">
                                ✓
                            </div>
                            <h1 className="activate-page__title">Account activated</h1>
                            <p className="activate-page__text">
                                Your email has been verified. You can now log in to
                                HomeShare.
                            </p>
                            <button
                                type="button"
                                className="activate-page__login-btn"
                                onClick={onGoToLogin}
                            >
                                Log in
                            </button>
                        </>
                    )}

                    {status === "error" && (
                        <>
                            <div
                                className="activate-page__icon activate-page__icon--error"
                                aria-hidden="true"
                            >
                                !
                            </div>
                            <h1 className="activate-page__title">Activation failed</h1>
                            <p className="activate-page__text">{errorMessage}</p>
                            <button
                                type="button"
                                className="activate-page__login-btn"
                                onClick={onGoToLogin}
                            >
                                Go to login
                            </button>
                        </>
                    )}

                    {status === "missing" && (
                        <>
                            <h1 className="activate-page__title">Invalid activation link</h1>
                            <p className="activate-page__text">
                                No activation token was found. Use the link from your
                                email or request a new one from login.
                            </p>
                            <button
                                type="button"
                                className="activate-page__login-btn"
                                onClick={onGoToLogin}
                            >
                                Go to login
                            </button>
                        </>
                    )}
                </div>
            </div>
        </GradientPageLayout>
    );
}

export default ActivateAccount;
