async function verifyRecaptcha(token) {
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) {
        return { success: false, error: "not_configured" };
    }

    const params = new URLSearchParams({
        secret,
        response: token,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(
            "https://www.google.com/recaptcha/api/siteverify",
            {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString(),
                signal: controller.signal,
            }
        );

        return response.json();
    } catch (err) {
        if (err.name === "AbortError") {
            return { success: false, "error-codes": ["recaptcha-verify-timeout"] };
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = verifyRecaptcha;
