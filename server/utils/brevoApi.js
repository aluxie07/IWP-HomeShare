const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_FETCH_TIMEOUT_MS = Number(process.env.BREVO_FETCH_TIMEOUT_MS) || 25000;

async function brevoFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(BREVO_FETCH_TIMEOUT_MS),
    });
    return response;
}

function getBrevoApiKey() {
    return (process.env.BREVO_API_KEY || "").trim();
}

function isBrevoApiConfigured() {
    return Boolean(getBrevoApiKey());
}

function getSender() {
    const email = (process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL || "").trim();
    const name = (process.env.EMAIL_FROM_NAME || "HomeShare").trim();

    if (!email) {
        throw new Error("EMAIL_FROM is required when using BREVO_API_KEY");
    }

    return { email, name };
}

async function sendViaBrevoApi({ to, subject, text, html }) {
    const apiKey = getBrevoApiKey();
    const sender = getSender();

    const response = await brevoFetch(BREVO_API_URL, {
        method: "POST",
        headers: {
            "api-key": apiKey,
            "Content-Type": "application/json",
            accept: "application/json",
        },
        body: JSON.stringify({
            sender,
            to: [{ email: to }],
            subject,
            htmlContent: html,
            textContent: text,
        }),
    });

    if (!response.ok) {
        let message = `Brevo API error (${response.status})`;
        try {
            const body = await response.json();
            message = body.message || body.error || message;
        } catch {
            // ignore parse errors
        }
        throw new Error(message);
    }

    return { sent: true, provider: "brevo-api" };
}

async function verifyBrevoApi() {
    if (!isBrevoApiConfigured()) {
        return { ok: false, message: "BREVO_API_KEY not set" };
    }

    try {
        const response = await brevoFetch("https://api.brevo.com/v3/account", {
            headers: {
                "api-key": getBrevoApiKey(),
                accept: "application/json",
            },
        });

        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            return {
                ok: false,
                message: body.message || `Brevo API rejected key (${response.status})`,
            };
        }

        return { ok: true, message: "Brevo API connection verified (HTTPS)" };
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

module.exports = {
    sendViaBrevoApi,
    verifyBrevoApi,
    isBrevoApiConfigured,
};
