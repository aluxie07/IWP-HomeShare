const verifyRecaptcha = require("../utils/verifyRecaptcha");
const { isRenderHost } = require("../utils/emailConfig");

/** reCAPTCHA only on Render (cloud). Always off for local Node / Local Network Mode. */
function isRecaptchaRequired() {
    const flag = (process.env.SKIP_RECAPTCHA || "").trim().toLowerCase();
    if (flag === "true" || flag === "1" || flag === "yes") {
        return false;
    }

    // Never require on a machine that is not Render
    if (!isRenderHost()) {
        return false;
    }

    if (flag === "false" || flag === "0" || flag === "no") {
        return Boolean((process.env.RECAPTCHA_SECRET_KEY || "").trim());
    }

    return Boolean((process.env.RECAPTCHA_SECRET_KEY || "").trim());
}

async function verifyRecaptchaMiddleware(req, res, next) {
    if (!isRecaptchaRequired()) {
        next();
        return;
    }

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
            const codes = result["error-codes"] || [];
            let message = "reCAPTCHA verification failed. Please try again.";

            if (codes.includes("invalid-input-secret")) {
                message =
                    "reCAPTCHA secret key is invalid or does not match the site key. Use the secret from the same key pair in Google reCAPTCHA admin.";
            } else if (codes.includes("invalid-input-response")) {
                message = "reCAPTCHA expired or was already used. Complete the checkbox again.";
            } else if (codes.includes("timeout-or-duplicate")) {
                message =
                    "reCAPTCHA was already used or timed out. Check the box again, then submit once.";
            } else if (codes.includes("recaptcha-verify-timeout")) {
                message = "Could not reach Google reCAPTCHA. Try again in a moment.";
            }

            console.error("[reCAPTCHA] verify failed:", codes.join(", ") || result);
            return res.status(400).json({ message });
        }

        next();
    } catch {
        return res.status(500).json({ message: "Could not verify reCAPTCHA" });
    }
}

module.exports = verifyRecaptchaMiddleware;
module.exports.isRecaptchaRequired = isRecaptchaRequired;
