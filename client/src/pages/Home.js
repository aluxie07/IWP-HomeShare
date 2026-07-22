import GradientPageLayout from "../components/GradientPageLayout";

const HOME_DESCRIPTION =
    "HomeShare helps families and classrooms share files on the same Wi‑Fi, with an optional online mode when you’re away. Keep files on a PC at home or school, or use the cloud when you need access from anywhere.";

function Home({
    onGetStarted,
    onLocalNetworkSetup,
    onGoToDashboard,
    onOpenHelp,
    showGetStarted,
    showLocalWifi,
}) {
    return (
        <GradientPageLayout>
            <div className="home-hero">
                <div className="home-hero-left">
                    <img
                        src={`${process.env.PUBLIC_URL}/HomeShareLogo.png`}
                        alt="HomeShare logo"
                        className="home-hero-logo"
                    />
                    <div className="home-hero-actions">
                        {showGetStarted && (
                            <button
                                type="button"
                                className="get-started-btn get-started-btn--with-icon"
                                onClick={onGetStarted}
                            >
                                Get Started{" "}
                                <span className="get-started-btn__icon" aria-hidden="true">
                                    {"\u2197"}
                                </span>
                            </button>
                        )}
                        {showLocalWifi && (
                            <>
                                <button
                                    type="button"
                                    className="get-started-btn home-dashboard-btn"
                                    onClick={onGoToDashboard}
                                >
                                    Go to Dashboard
                                </button>
                                <div className="home-local-mode-wrap">
                                    <button
                                        type="button"
                                        className="home-local-mode-btn"
                                        onClick={onLocalNetworkSetup}
                                    >
                                        Use on this Wi‑Fi
                                    </button>
                                    <p className="home-local-mode-hint">
                                        Set up once on a home or classroom PC, then everyone on the
                                        same Wi‑Fi can use this website.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <div className="home-hero-right">
                    <div className="home-hero-copy">
                        <h1 className="home-hero-headline">Share files at home or in class</h1>
                        <p className="home-hero-text">{HOME_DESCRIPTION}</p>
                        <ul className="home-mode-lines">
                            <li>
                                <strong>Online</strong> — use HomeShare from anywhere with
                                internet.
                            </li>
                            <li>
                                <strong>This Wi‑Fi</strong> — keep files on a host PC at home or
                                school.
                            </li>
                        </ul>
                        {showGetStarted && (
                            <div className="home-guest-guide">
                                <ol className="home-steps">
                                    <li>Create a free account</li>
                                    <li>Upload and share files</li>
                                    <li>Optional: set up This Wi‑Fi for home or class</li>
                                </ol>
                                {onOpenHelp && (
                                    <button
                                        type="button"
                                        className="home-help-link"
                                        onClick={onOpenHelp}
                                    >
                                        How does it work?
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </GradientPageLayout>
    );
}

export default Home;
