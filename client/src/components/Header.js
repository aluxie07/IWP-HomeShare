import { useEffect, useState } from "react";

function Header({
    currentPage,
    isLoggedIn,
    apiMode,
    apiConnected,
    onLogoClick,
    onHomeClick,
    onDashboardClick,
    onUploadClick,
    onLibraryClick,
    onHelpClick,
    onExitLocalMode,
    exitingLocalMode,
    onGetStarted,
    showGetStarted,
}) {
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        setMenuOpen(false);
    }, [currentPage]);

    useEffect(() => {
        if (!menuOpen) {
            return undefined;
        }

        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                setMenuOpen(false);
            }
        };

        document.addEventListener("keydown", onKeyDown);
        document.body.classList.add("header-menu-open");

        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.classList.remove("header-menu-open");
        };
    }, [menuOpen]);

    const runAndClose = (handler) => () => {
        setMenuOpen(false);
        handler?.();
    };

    const isLocalMode =
        apiConnected && (apiMode === "local" || apiMode === "manual");
    const modeLabel = isLocalMode
        ? "This Wi‑Fi"
        : apiMode === "cloud"
          ? "Online"
          : apiMode === "detecting"
            ? "…"
            : "Online";

    return (
        <header className={`site-header ${menuOpen ? "site-header--menu-open" : ""}`}>
            <div className="header-bar">
                <div className="header-brand">
                    <button type="button" className="header-logo-btn" onClick={onLogoClick}>
                        <img
                            src={`${process.env.PUBLIC_URL}/HomeShareLogo.png`}
                            alt="HomeShare logo"
                            className="header-logo"
                        />
                    </button>
                    <span
                        className={`header-mode-badge ${
                            isLocalMode
                                ? "header-mode-badge--local"
                                : "header-mode-badge--cloud"
                        }`}
                        title={isLocalMode ? "This Wi‑Fi (Local)" : "Online (Cloud)"}
                    >
                        {modeLabel}
                    </span>
                    {isLocalMode && onExitLocalMode && (
                        <button
                            type="button"
                            className="header-mode-exit"
                            onClick={onExitLocalMode}
                            disabled={exitingLocalMode}
                            title="Switch back to Online (Cloud)"
                        >
                            {exitingLocalMode ? "…" : "Use online"}
                        </button>
                    )}
                </div>

                <nav className="header-desktop-nav" aria-label="Main">
                    <button
                        type="button"
                        className={`header-nav-link ${
                            currentPage === "home" ? "header-nav-link--active" : ""
                        }`}
                        onClick={onHomeClick}
                    >
                        Home
                    </button>
                    {isLoggedIn && (
                        <>
                            <button
                                type="button"
                                className={`header-nav-link ${
                                    currentPage === "dashboard"
                                        ? "header-nav-link--active"
                                        : ""
                                }`}
                                onClick={onDashboardClick}
                            >
                                Dashboard
                            </button>
                            <button
                                type="button"
                                className={`header-nav-link ${
                                    currentPage === "upload" ? "header-nav-link--active" : ""
                                }`}
                                onClick={onUploadClick}
                            >
                                Upload
                            </button>
                            <button
                                type="button"
                                className={`header-nav-link ${
                                    currentPage === "library" ? "header-nav-link--active" : ""
                                }`}
                                onClick={onLibraryClick}
                            >
                                Library
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        className={`header-nav-link ${
                            currentPage === "help" ? "header-nav-link--active" : ""
                        }`}
                        onClick={onHelpClick}
                    >
                        Help
                    </button>
                    {!isLoggedIn && showGetStarted && (
                        <button type="button" className="get-started-btn" onClick={onGetStarted}>
                            Get Started
                        </button>
                    )}
                </nav>

                <button
                    type="button"
                    className={`header-hamburger ${menuOpen ? "header-hamburger--open" : ""}`}
                    aria-label={menuOpen ? "Close menu" : "Open menu"}
                    aria-expanded={menuOpen}
                    aria-controls="header-mobile-menu"
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    <span />
                    <span />
                    <span />
                </button>
            </div>

            {menuOpen && (
                <button
                    type="button"
                    className="header-menu-backdrop"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                />
            )}

            <nav
                id="header-mobile-menu"
                className={`header-mobile-nav ${menuOpen ? "header-mobile-nav--open" : ""}`}
                aria-label="Mobile"
                hidden={!menuOpen}
            >
                <button
                    type="button"
                    className={`header-nav-link ${
                        currentPage === "home" ? "header-nav-link--active" : ""
                    }`}
                    onClick={runAndClose(onHomeClick)}
                >
                    Home
                </button>
                {isLoggedIn && (
                    <>
                        <button
                            type="button"
                            className={`header-nav-link ${
                                currentPage === "dashboard" ? "header-nav-link--active" : ""
                            }`}
                            onClick={runAndClose(onDashboardClick)}
                        >
                            Dashboard
                        </button>
                        <button
                            type="button"
                            className={`header-nav-link ${
                                currentPage === "upload" ? "header-nav-link--active" : ""
                            }`}
                            onClick={runAndClose(onUploadClick)}
                        >
                            Upload
                        </button>
                        <button
                            type="button"
                            className={`header-nav-link ${
                                currentPage === "library" ? "header-nav-link--active" : ""
                            }`}
                            onClick={runAndClose(onLibraryClick)}
                        >
                            Library
                        </button>
                    </>
                )}
                <button
                    type="button"
                    className={`header-nav-link ${
                        currentPage === "help" ? "header-nav-link--active" : ""
                    }`}
                    onClick={runAndClose(onHelpClick)}
                >
                    Help
                </button>
                {!isLoggedIn && showGetStarted && (
                    <button
                        type="button"
                        className="get-started-btn get-started-btn--mobile"
                        onClick={runAndClose(onGetStarted)}
                    >
                        Get Started
                    </button>
                )}
            </nav>
        </header>
    );
}

export default Header;
