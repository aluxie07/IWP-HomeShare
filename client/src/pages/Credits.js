import GradientPageLayout from "../components/GradientPageLayout";

function Credits({ onBack }) {
    return (
        <GradientPageLayout>
            <section className="credits-card">
                <h2 className="auth-title">Credits</h2>
                <div className="credits-logo-block">
                    <p className="credits-label">Website Logo:</p>
                    <img
                        src={`${process.env.PUBLIC_URL}/HomeShareLogo.png`}
                        alt="HomeShare logo"
                        className="credits-logo"
                    />
                    <a
                        href="https://www.flaticon.com/free-icons/home"
                        title="home icons"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Home icons created by Freepik - Flaticon
                    </a>
                </div>
                <button type="button" className="back-link" onClick={onBack}>
                    Back
                </button>
            </section>
        </GradientPageLayout>
    );
}

export default Credits;
