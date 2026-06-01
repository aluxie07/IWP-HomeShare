function Footer({ onCreditsClick }) {
    return (
        <footer className="site-footer">
            <button type="button" className="footer-link" onClick={onCreditsClick}>
                Credits
            </button>
        </footer>
    );
}

export default Footer;
