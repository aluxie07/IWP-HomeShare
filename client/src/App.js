import { useEffect, useState } from "react";
import "./App.css";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Credits from "./pages/Credits";
import Dashboard from "./pages/Dashboard";
import ActivateAccount from "./pages/ActivateAccount";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import DeleteAccount from "./pages/DeleteAccount";
import {
    isLoggedIn as hasStoredAuth,
    clearAuth,
} from "./utils/authStorage";
import {
    getVerifyTokenFromUrl,
    getResetTokenFromUrl,
    clearUrlSearchParams,
} from "./utils/urlTokens";

function getInitialRoute() {
    const verifyToken = getVerifyTokenFromUrl();
    if (verifyToken) {
        return { page: "activate", verifyToken, resetToken: null };
    }

    const resetToken = getResetTokenFromUrl();
    if (resetToken) {
        return { page: "reset-password", verifyToken: null, resetToken };
    }

    return { page: "home", verifyToken: null, resetToken: null };
}

function App() {
    const initial = getInitialRoute();
    const [page, setPage] = useState(initial.page);
    const [verifyToken, setVerifyToken] = useState(initial.verifyToken);
    const [resetToken, setResetToken] = useState(initial.resetToken);
    const [isLoggedIn, setIsLoggedIn] = useState(hasStoredAuth);

    useEffect(() => {
        const verify = getVerifyTokenFromUrl();
        const reset = getResetTokenFromUrl();

        if (verify) {
            setVerifyToken(verify);
            setResetToken(null);
            setPage("activate");
            clearUrlSearchParams();
            return;
        }

        if (reset) {
            setResetToken(reset);
            setVerifyToken(null);
            setPage("reset-password");
            clearUrlSearchParams();
        }
    }, []);

    const usesGradientBackground =
        page === "home" ||
        page === "login" ||
        page === "register" ||
        page === "credits" ||
        page === "activate" ||
        page === "forgot-password" ||
        page === "reset-password";

    const redirectToLogin = () => {
        clearAuth();
        setIsLoggedIn(false);
        setPage("login");
    };

    useEffect(() => {
        if (
            (page === "dashboard" || page === "delete-account") &&
            !hasStoredAuth()
        ) {
            setPage("login");
        }
    }, [page]);

    return (
        <div className="App">
            <Header
                currentPage={page}
                isLoggedIn={isLoggedIn}
                onLogoClick={() => setPage("home")}
                onHomeClick={() => setPage("home")}
                onDashboardClick={() => {
                    if (!hasStoredAuth()) {
                        setPage("login");
                        return;
                    }
                    setPage("dashboard");
                }}
                onGetStarted={() => setPage("register")}
                showGetStarted={!isLoggedIn}
            />
            <main
                className={`main-content ${
                    usesGradientBackground ? "main-content--gradient" : ""
                }`}
            >
                {page === "home" && (
                    <Home
                        onGetStarted={() => setPage("register")}
                        showGetStarted={!isLoggedIn}
                    />
                )}
                {page === "credits" && <Credits onBack={() => setPage("home")} />}
                {page === "login" && (
                    <Login
                        onLoginSuccess={() => {
                            setIsLoggedIn(true);
                            setPage("dashboard");
                        }}
                        onSwitchToRegister={() => setPage("register")}
                        onForgotPassword={() => setPage("forgot-password")}
                    />
                )}
                {page === "forgot-password" && (
                    <ForgotPassword onBackToLogin={() => setPage("login")} />
                )}
                {page === "register" && (
                    <Register onSwitchToLogin={() => setPage("login")} />
                )}
                {page === "activate" && (
                    <ActivateAccount
                        token={verifyToken}
                        onGoToLogin={() => {
                            setVerifyToken(null);
                            setPage("login");
                        }}
                    />
                )}
                {page === "reset-password" && (
                    <ResetPassword
                        token={resetToken}
                        onGoToLogin={() => {
                            setResetToken(null);
                            setPage("login");
                        }}
                    />
                )}
                {page === "dashboard" && (
                    <Dashboard
                        onRedirectToLogin={redirectToLogin}
                        onLogout={redirectToLogin}
                        onDeleteAccount={() => setPage("delete-account")}
                    />
                )}
                {page === "delete-account" && (
                    <DeleteAccount
                        onCancel={() => setPage("dashboard")}
                        onAccountDeleted={() => {
                            setIsLoggedIn(false);
                            setPage("home");
                        }}
                    />
                )}
            </main>
            <Footer onCreditsClick={() => setPage("credits")} />
        </div>
    );
}

export default App;
