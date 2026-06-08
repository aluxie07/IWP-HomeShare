import GradientPageLayout from "../components/GradientPageLayout";

const HOME_DESCRIPTION =
    "HomeShare is a lightweight local-network file sharing platform designed to provide secure and private file access within trusted environments such as homes, classrooms, and small offices. Unlike traditional cloud storage systems, HomeShare focuses on local hosting and network-aware security, allowing users connected to the same Wi-Fi network to upload, access, and manage shared files without relying on large external cloud services.";

function Home({ onGetStarted, onLocalNetworkSetup, showGetStarted }) {
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
                        <button
                            type="button"
                            className="home-local-mode-btn"
                            onClick={onLocalNetworkSetup}
                        >
                            Enable Local Network Mode
                        </button>
                    </div>
                </div>
                <div className="home-hero-right">
                    <p className="home-hero-text">{HOME_DESCRIPTION}</p>
                </div>
            </div>
        </GradientPageLayout>
    );
}

export default Home;
