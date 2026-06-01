function Header({
    currentPage,
    isLoggedIn,
    onLogoClick,
    onHomeClick,
    onDashboardClick,
    onGetStarted,
    showGetStarted,
}) {
    return (
        <header className="site-header">
            <div className="header-slot header-slot--logo">
                <button type="button" className="header-logo-btn" onClick={onLogoClick}>
                    <img
                        src={`${process.env.PUBLIC_URL}/HomeShareLogo.png`}
                        alt="HomeShare logo"
                        className="header-logo"
                    />
                </button>
            </div>
            <div className="header-slot header-slot--home">
                <button
                    type="button"
                    className={`header-nav-link ${
                        currentPage === "home" ? "header-nav-link--active" : ""
                    }`}
                    onClick={onHomeClick}
                >
                    Home
                </button>
            </div>
            <div className="header-slot header-slot--dashboard">
                {isLoggedIn && (
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
                )}
            </div>
            <div className="header-slot" aria-hidden="true" />
            <div className="header-slot header-slot--action">
                {showGetStarted && (
                    <button type="button" className="get-started-btn" onClick={onGetStarted}>
                        Get Started
                    </button>
                )}
            </div>
        </header>
    );
}

export default Header;
