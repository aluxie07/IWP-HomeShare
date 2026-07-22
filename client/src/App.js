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
import LocalNetworkSetup from "./pages/LocalNetworkSetup";
import Help from "./pages/Help";
import { initApiDiscovery, switchToCloudApi } from "./utils/apiDiscovery";
import {
    isLoggedIn as hasStoredAuth,
    isLoggedInToActiveApi,
    clearAuth,
    getActiveApiSlot,
} from "./utils/authStorage";
import { apiFetch } from "./utils/api";
import {
    useIdleTimeout,
    touchSessionActivity,
    clearSessionActivity,
} from "./utils/idleTimeout";
import { validateAndPruneSessions } from "./utils/sessionValidate";
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
    const [isLoggedIn, setIsLoggedIn] = useState(() => isLoggedInToActiveApi());
    const [sessionChecked, setSessionChecked] = useState(!hasStoredAuth());
    const [apiDiscovery, setApiDiscovery] = useState({
        mode: "detecting",
        url: "",
        connected: false,
    });
    const [exitingLocalMode, setExitingLocalMode] = useState(false);
    const [helpFocus, setHelpFocus] = useState(null);

    const openHelp = (section = null) => {
        setHelpFocus(typeof section === "string" ? section : null);
        setPage("help");
    };

    const applyDiscoveryResult = (result) => {
        setApiDiscovery({
            mode: result.mode,
            url: result.url,
            connected: result.connected,
        });
        // Mode change switches which session is valid (cloud JWT ≠ local JWT)
        setIsLoggedIn(isLoggedInToActiveApi());
    };

    useEffect(() => {
        let cancelled = false;

        initApiDiscovery().then(async (result) => {
            if (cancelled) {
                return;
            }
            setApiDiscovery({
                mode: result.mode,
                url: result.url,
                connected: result.connected,
            });

            if (!hasStoredAuth()) {
                setIsLoggedIn(false);
                setSessionChecked(true);
                return;
            }

            await validateAndPruneSessions();
            if (cancelled) {
                return;
            }
            const activeOk = isLoggedInToActiveApi();
            setIsLoggedIn(activeOk);
            setSessionChecked(true);
            if (!activeOk) {
                clearSessionActivity();
                setPage((current) => {
                    const protectedPages = [
                        "dashboard",
                        "delete-account",
                        "upload",
                        "library",
                        "shared-file",
                    ];
                    if (protectedPages.includes(current)) {
                        return "login";
                    }
                    return current;
                });
            }
        });

        return () => {
            cancelled = true;
        };
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

    const usesGradientBackground = true;

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
        // Clear only the active API session so the other side stays linked
        clearAuth(getActiveApiSlot());
        clearSessionActivity();
        const activeOk = isLoggedInToActiveApi();
        setIsLoggedIn(activeOk);
        setPage(activeOk ? "dashboard" : "login");
    };

    useIdleTimeout(isLoggedIn && sessionChecked, () => {
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
        ];
        if (protectedPages.includes(page) && !isLoggedInToActiveApi()) {
            if (page === "shared-file" && shareToken) {
                setPendingShare(shareToken);
                ensureShareInUrl(shareToken);
            }
            setPage("login");
        }
    }, [page, shareToken, apiDiscovery.mode]);

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
                    if (!isLoggedInToActiveApi()) {
                        setPage("login");
                        return;
                    }
                    setPage("dashboard");
                }}
                onUploadClick={() => {
                    if (!isLoggedInToActiveApi()) {
                        setPage("login");
                        return;
                    }
                    setPage("upload");
                }}
                onLibraryClick={() => {
                    if (!isLoggedInToActiveApi()) {
                        setPage("login");
                        return;
                    }
                    setPage("library");
                }}
                onHelpClick={() => openHelp()}
                onExitLocalMode={async () => {
                    setExitingLocalMode(true);
                    try {
                        const result = await switchToCloudApi();
                        applyDiscoveryResult(result);
                    } catch {
                        // keep current mode if cloud switch fails
                    } finally {
                        setExitingLocalMode(false);
                    }
                }}
                exitingLocalMode={exitingLocalMode}
                onGetStarted={() => setPage("register")}
                showGetStarted={!isLoggedIn}
            />
            <main
                className={`main-content ${
                    usesGradientBackground ? "main-content--gradient" : ""
                }`}
            >
                <div className="app-page-shell">
                    <div className="app-page-glow" aria-hidden="true" />
                    <div
                        className={`app-page-shell__content ${
                            page === "home"
                                ? "app-page-shell__content--scroll"
                                : page === "login" ||
                                    page === "register" ||
                                    page === "credits" ||
                                    page === "activate" ||
                                    page === "forgot-password" ||
                                    page === "reset-password"
                                  ? "app-page-shell__content--center"
                                  : "app-page-shell__content--scroll"
                        }`}
                    >
                {page === "home" && (
                    <Home
                        onGetStarted={() => setPage("register")}
                        onLocalNetworkSetup={() => setPage("local-network-setup")}
                        onGoToDashboard={() => setPage("dashboard")}
                        onOpenHelp={openHelp}
                        showGetStarted={!isLoggedIn}
                        showLocalWifi={isLoggedIn}
                    />
                )}
                {page === "credits" && <Credits onBack={() => setPage("home")} />}
                {page === "help" && (
                    <Help
                        onBack={() => setPage(isLoggedIn ? "dashboard" : "home")}
                        onOpenLocalSetup={() => setPage("local-network-setup")}
                        focusSection={helpFocus}
                    />
                )}
                {page === "login" && (
                    <Login
                        onLoginSuccess={handleLoginSuccess}
                        onSwitchToRegister={() => setPage("register")}
                        onForgotPassword={() => setPage("forgot-password")}
                        onApiModeChanged={(result) => {
                            applyDiscoveryResult(result);
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
                        onGoToLocalSetup={() => setPage("local-network-setup")}
                    />
                )}
                {page === "local-network-setup" && (
                    <LocalNetworkSetup
                        onBack={() => setPage(isLoggedIn ? "dashboard" : "home")}
                        onDiscoveryUpdated={applyDiscoveryResult}
                        onGoToLogin={() => setPage("login")}
                        onGoToRegister={() => setPage("register")}
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
                    </div>
                </div>
            </main>
            <Footer
                onCreditsClick={() => setPage("credits")}
                onHelpClick={() => openHelp()}
            />
        </div>
    );
}

export default App;
