const verifyRecaptcha = require("../utils/verifyRecaptcha");

async function verifyRecaptchaMiddleware(req, res, next) {
    const token = req.body.recaptchaToken;

    if (!token) {
        return res
            .status(400)
            .json({ message: "Please complete the reCAPTCHA verification" });
    }

    if (!process.env.RECAPTCHA_SECRET_KEY) {
        return res.status(500).json({
            message: "reCAPTCHA is not configured on the server",
        });
    }

    try {
        const result = await verifyRecaptcha(token);

        if (!result.success) {
            return res.status(400).json({
                message: "reCAPTCHA verification failed. Please try again.",
            });
        }

        next();
    } catch {
        return res.status(500).json({ message: "Could not verify reCAPTCHA" });
    }
}

module.exports = verifyRecaptchaMiddleware;
