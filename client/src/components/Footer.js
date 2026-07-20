function Footer({ onCreditsClick, onHelpClick }) {
    return (
        <footer className="site-footer">
            {onHelpClick && (
                <button type="button" className="footer-link" onClick={onHelpClick}>
                    Help
                </button>
            )}
            <button type="button" className="footer-link" onClick={onCreditsClick}>
                Credits
            </button>
        </footer>
    );
}

export default Footer;
