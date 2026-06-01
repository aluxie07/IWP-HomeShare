import GradientBackground from "./GradientBackground";

function GradientPageLayout({ children }) {
    return (
        <div className="gradient-page">
            <GradientBackground />
            <div className="gradient-page-content">{children}</div>
        </div>
    );
}

export default GradientPageLayout;
