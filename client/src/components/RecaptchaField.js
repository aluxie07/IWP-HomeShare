import ReCAPTCHA from "react-google-recaptcha";

const SITE_KEY = process.env.REACT_APP_RECAPTCHA_SITE_KEY;

function RecaptchaField({ onTokenChange }) {
    const handleChange = (token) => {
        onTokenChange(token);
    };

    const handleExpired = () => {
        onTokenChange(null);
    };

    if (!SITE_KEY) {
        return (
            <p className="recaptcha-error">
                reCAPTCHA is not configured. Use a v2 &quot;I&apos;m not a robot&quot;
                Checkbox site key in client/.env (not v3).
            </p>
        );
    }

    return (
        <div className="recaptcha-wrapper">
            <ReCAPTCHA
                sitekey={SITE_KEY}
                onChange={handleChange}
                onExpired={handleExpired}
            />
        </div>
    );
}

export default RecaptchaField;
