function CloudIcon() {
    return (
        <svg className="home-split__icon" viewBox="0 0 48 48" aria-hidden="true">
            <path
                fill="currentColor"
                d="M38.5 20.2A12.5 12.5 0 0 0 15.2 16 9.5 9.5 0 0 0 16 35h21.5A8.5 8.5 0 0 0 38.5 20.2Z"
            />
        </svg>
    );
}

function RouterIcon() {
    return (
        <svg className="home-split__icon" viewBox="0 0 48 48" aria-hidden="true">
            <path
                fill="currentColor"
                d="M10 30h28a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Zm4 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8.5-14.2a1.5 1.5 0 0 1 0-3 8 8 0 0 1 0 16 1.5 1.5 0 0 1 0-3 5 5 0 0 0 0-10Zm0-6.5a1.5 1.5 0 0 1 0-3 14.5 14.5 0 0 1 0 29 1.5 1.5 0 1 1 0-3 11.5 11.5 0 0 0 0-23Z"
            />
        </svg>
    );
}

function Home({
    onGetStarted,
    onLocalNetworkSetup,
    onGoToDashboard,
    onOpenHelp,
    showGetStarted,
    showLocalWifi,
}) {
    return (
        <div className="home-landing">
            <section className="home-hero-text">
                <p className="home-hero-text__eyebrow">Homes &amp; classrooms</p>
                <h1 className="home-hero-text__headline">One library, two networks.</h1>
                <p className="home-hero-text__sub">
                    Share files Online from anywhere, or keep them on a host PC for This Wi‑Fi —
                    same login, one library.
                </p>
            </section>

            <section className="home-split" aria-label="Online and This Wi‑Fi">
                <button
                    type="button"
                    className="home-split__panel home-split__panel--online"
                    onClick={() => onOpenHelp("online")}
                >
                    <CloudIcon />
                    <div className="home-split__panel-copy">
                        <span className="home-split__pill home-split__pill--online">ONLINE</span>
                        <h2 className="home-split__title">Online</h2>
                        <p className="home-split__desc">
                            Use HomeShare from anywhere with internet. Files live in the cloud.
                        </p>
                        <span className="home-split__cta home-split__cta--on-rose">→ Help</span>
                    </div>
                </button>

                <div className="home-split__seam" aria-hidden="true">
                    <span className="home-split__seam-line" />
                    <span className="home-split__same-login">same login</span>
                    <span className="home-split__seam-line" />
                </div>

                <button
                    type="button"
                    className="home-split__panel home-split__panel--wifi"
                    onClick={() => onOpenHelp("local")}
                >
                    <RouterIcon />
                    <div className="home-split__panel-copy">
                        <span className="home-split__pill home-split__pill--wifi">LOCAL</span>
                        <h2 className="home-split__title">This Wi‑Fi</h2>
                        <p className="home-split__desc">
                            Keep files on a host PC at home or school. Everyone else just uses this
                            site.
                        </p>
                        <span className="home-split__cta">→ Help</span>
                    </div>
                </button>
            </section>

            {showGetStarted && (
                <>
                    <ol className="home-steps-strip">
                        <li>
                            <span className="home-steps-strip__num">1</span>
                            <span className="home-steps-strip__label">Register</span>
                        </li>
                        <li>
                            <span className="home-steps-strip__num">2</span>
                            <span className="home-steps-strip__label">Pick a mode</span>
                        </li>
                        <li>
                            <span className="home-steps-strip__num">3</span>
                            <span className="home-steps-strip__label">Share</span>
                        </li>
                    </ol>

                    <div className="home-cta-row">
                        <button
                            type="button"
                            className="home-cta-row__primary"
                            onClick={onGetStarted}
                        >
                            Get Started
                        </button>
                        <button
                            type="button"
                            className="home-cta-row__help"
                            onClick={() => onOpenHelp()}
                        >
                            How does it work?
                        </button>
                    </div>
                </>
            )}

            {showLocalWifi && (
                <div className="home-action-tiles">
                    <button
                        type="button"
                        className="home-action-tile home-action-tile--primary"
                        onClick={onGoToDashboard}
                    >
                        <span className="home-action-tile__title">Go to Dashboard</span>
                        <span className="home-action-tile__hint">
                            Upload, library, and your connection status.
                        </span>
                    </button>
                    <button
                        type="button"
                        className="home-action-tile"
                        onClick={onLocalNetworkSetup}
                    >
                        <span className="home-action-tile__title">Use on this Wi‑Fi</span>
                        <span className="home-action-tile__hint">
                            Set up once on a home or classroom PC, then everyone on the same Wi‑Fi
                            can use this website.
                        </span>
                    </button>
                </div>
            )}
        </div>
    );
}

export default Home;
