function GradientPageLayout({ children, align = "center" }) {
    return (
        <div
            className={`gradient-page-content ${
                align === "start" ? "gradient-page-content--start" : ""
            }`}
        >
            {children}
        </div>
    );
}

export default GradientPageLayout;
