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
import FileUpload from "./pages/FileUpload";
import FileLibrary from "./pages/FileLibrary";
import SharedFile from "./pages/SharedFile";
import {
    isLoggedIn as hasStoredAuth,
    clearAuth,
} from "./utils/authStorage";
import {
    getVerifyTokenFromUrl,
    getResetTokenFromUrl,
    getShareTokenFromUrl,
    clearUrlSearchParams,
    consumePendingShare,
} from "./utils/urlTokens";

function getInitialRoute() {
    const verifyToken = getVerifyTokenFromUrl();
    if (verifyToken) {
        return { page: "activate", verifyToken, resetToken: null, shareToken: null };
    }

    const resetToken = getResetTokenFromUrl();
    if (resetToken) {
        return { page: "reset-password", verifyToken: null, resetToken, shareToken: null };
    }

    const shareToken = getShareTokenFromUrl();
    if (shareToken) {
        if (!hasStoredAuth()) {
            sessionStorage.setItem("pendingShare", shareToken);
            return { page: "login", verifyToken: null, resetToken: null, shareToken };
        }
        return { page: "shared-file", verifyToken: null, resetToken: null, shareToken };
    }

    const pendingShare = consumePendingShare();
    if (pendingShare && hasStoredAuth()) {
        return {
            page: "shared-file",
            verifyToken: null,
            resetToken: null,
            shareToken: pendingShare,
        };
    }

    return { page: "home", verifyToken: null, resetToken: null, shareToken: null };
}

function App() {
    const initial = getInitialRoute();
    const [page, setPage] = useState(initial.page);
    const [verifyToken, setVerifyToken] = useState(initial.verifyToken);
    const [resetToken, setResetToken] = useState(initial.resetToken);
    const [shareToken, setShareToken] = useState(initial.shareToken);
    const [isLoggedIn, setIsLoggedIn] = useState(hasStoredAuth);

    useEffect(() => {
        const verify = getVerifyTokenFromUrl();
        const reset = getResetTokenFromUrl();
        const share = getShareTokenFromUrl();

        if (verify) {
            setVerifyToken(verify);
            setResetToken(null);
            setShareToken(null);
            setPage("activate");
            clearUrlSearchParams();
            return;
        }

        if (reset) {
            setResetToken(reset);
            setVerifyToken(null);
            setShareToken(null);
            setPage("reset-password");
            clearUrlSearchParams();
            return;
        }

        if (share) {
            setShareToken(share);
            setVerifyToken(null);
            setResetToken(null);
            setPage("shared-file");
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

    const handleLoginSuccess = () => {
        setIsLoggedIn(true);
        const pendingShare = consumePendingShare();
        if (pendingShare) {
            setShareToken(pendingShare);
            setPage("shared-file");
            return;
        }
        setPage("dashboard");
    };

    useEffect(() => {
        const protectedPages = [
            "dashboard",
            "delete-account",
            "upload",
            "library",
            "shared-file",
        ];
        if (protectedPages.includes(page) && !hasStoredAuth()) {
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
                onUploadClick={() => {
                    if (!hasStoredAuth()) {
                        setPage("login");
                        return;
                    }
                    setPage("upload");
                }}
                onLibraryClick={() => {
                    if (!hasStoredAuth()) {
                        setPage("login");
                        return;
                    }
                    setPage("library");
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
                        onLoginSuccess={handleLoginSuccess}
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
                        onGoToUpload={() => setPage("upload")}
                        onGoToLibrary={() => setPage("library")}
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
                {page === "upload" && (
                    <FileUpload
                        onRedirectToLogin={redirectToLogin}
                        onGoToLibrary={() => setPage("library")}
                    />
                )}
                {page === "library" && (
                    <FileLibrary
                        onRedirectToLogin={redirectToLogin}
                        onGoToUpload={() => setPage("upload")}
                    />
                )}
                {page === "shared-file" && (
                    <SharedFile
                        shareToken={shareToken}
                        onRedirectToLogin={redirectToLogin}
                    />
                )}
            </main>
            <Footer onCreditsClick={() => setPage("credits")} />
        </div>
    );
}

export default App;
