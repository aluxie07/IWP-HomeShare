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
import NetworkSettings from "./pages/NetworkSettings";
import LocalNetworkSetup from "./pages/LocalNetworkSetup";
import Help from "./pages/Help";
import { initApiDiscovery, switchToCloudApi } from "./utils/apiDiscovery";
import {
    isLoggedIn as hasStoredAuth,
    clearAuth,
} from "./utils/authStorage";
import { apiFetch } from "./utils/api";
import {
    useIdleTimeout,
    touchSessionActivity,
    clearSessionActivity,
} from "./utils/idleTimeout";
import {
    getVerifyTokenFromUrl,
    getResetTokenFromUrl,
    getShareTokenFromUrl,
    clearUrlSearchParams,
    setPendingShare,
    peekPendingShare,
    consumePendingShare,
    ensureShareInUrl,
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

    const shareToken = getShareTokenFromUrl() || peekPendingShare();
    if (shareToken) {
        setPendingShare(shareToken);
        ensureShareInUrl(shareToken);
        if (!hasStoredAuth()) {
            return { page: "login", verifyToken: null, resetToken: null, shareToken };
        }
        return { page: "shared-file", verifyToken: null, resetToken: null, shareToken };
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
    const [apiDiscovery, setApiDiscovery] = useState({
        mode: "detecting",
        url: "",
        connected: false,
    });
    const [exitingLocalMode, setExitingLocalMode] = useState(false);

    useEffect(() => {
        initApiDiscovery().then((result) => {
            setApiDiscovery({
                mode: result.mode,
                url: result.url,
                connected: result.connected,
            });
        });
    }, []);

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
            setPendingShare(share);
            ensureShareInUrl(share);
            if (hasStoredAuth()) {
                setPage("shared-file");
            } else {
                setPage("login");
            }
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

    const redirectToLogin = async () => {
        const pending =
            shareToken || getShareTokenFromUrl() || peekPendingShare();
        if (pending) {
            setPendingShare(pending);
            setShareToken(pending);
            ensureShareInUrl(pending);
        }
        try {
            await apiFetch("/logout", { method: "POST" });
        } catch {
            // ignore
        }
        clearAuth();
        clearSessionActivity();
        setIsLoggedIn(false);
        setPage("login");
    };

    useIdleTimeout(isLoggedIn, () => {
        redirectToLogin();
    });

    const handleLoginSuccess = () => {
        touchSessionActivity();
        setIsLoggedIn(true);
        const pendingShare =
            consumePendingShare() ||
            shareToken ||
            getShareTokenFromUrl();
        if (pendingShare) {
            setShareToken(pendingShare);
            setPendingShare(pendingShare);
            ensureShareInUrl(pendingShare);
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
            "network-settings",
        ];
        if (protectedPages.includes(page) && !hasStoredAuth()) {
            if (page === "shared-file" && shareToken) {
                setPendingShare(shareToken);
                ensureShareInUrl(shareToken);
            }
            setPage("login");
        }
    }, [page, shareToken]);

    return (
        <div className="App">
            <Header
                currentPage={page}
                isLoggedIn={isLoggedIn}
                apiMode={apiDiscovery.mode}
                apiConnected={apiDiscovery.connected}
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
                onSettingsClick={() => {
                    if (!hasStoredAuth()) {
                        setPage("login");
                        return;
                    }
                    setPage("network-settings");
                }}
                onHelpClick={() => setPage("help")}
                onExitLocalMode={async () => {
                    setExitingLocalMode(true);
                    try {
                        const result = await switchToCloudApi();
                        setApiDiscovery({
                            mode: result.mode,
                            url: result.url,
                            connected: result.connected,
                        });
                    } catch {
                        // keep current mode if cloud switch fails
                    } finally {
                        setExitingLocalMode(false);
                    }
                }}
                exitingLocalMode={exitingLocalMode}
                showSettings={isLoggedIn}
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
                        onLocalNetworkSetup={() => setPage("local-network-setup")}
                        showGetStarted={!isLoggedIn}
                    />
                )}
                {page === "credits" && <Credits onBack={() => setPage("home")} />}
                {page === "help" && (
                    <Help
                        onBack={() => setPage(isLoggedIn ? "dashboard" : "home")}
                        onOpenLocalSetup={() => setPage("local-network-setup")}
                    />
                )}
                {page === "login" && (
                    <Login
                        onLoginSuccess={handleLoginSuccess}
                        onSwitchToRegister={() => setPage("register")}
                        onForgotPassword={() => setPage("forgot-password")}
                        onApiModeChanged={(result) => {
                            setApiDiscovery({
                                mode: result.mode,
                                url: result.url,
                                connected: result.connected,
                            });
                        }}
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
                        onGoToNetworkSettings={() => setPage("network-settings")}
                        onGoToLocalSetup={() => setPage("local-network-setup")}
                    />
                )}
                {page === "network-settings" && (
                    <NetworkSettings
                        onRedirectToLogin={redirectToLogin}
                        onBack={() => setPage("dashboard")}
                    />
                )}
                {page === "local-network-setup" && (
                    <LocalNetworkSetup
                        onBack={() => setPage(isLoggedIn ? "dashboard" : "home")}
                        onDiscoveryUpdated={(result) =>
                            setApiDiscovery({
                                mode: result.mode,
                                url: result.url,
                                connected: result.connected,
                            })
                        }
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
            <Footer
                onCreditsClick={() => setPage("credits")}
                onHelpClick={() => setPage("help")}
            />
        </div>
    );
}

export default App;
