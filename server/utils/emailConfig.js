function isRenderHost() {
    return Boolean(
        process.env.RENDER ||
            process.env.RENDER_SERVICE_ID ||
            process.env.RENDER_EXTERNAL_URL ||
            process.env.RENDER_SERVICE_NAME
    );
}

/** PaaS hosts that block outbound SMTP (587/465/25). Use BREVO_API_KEY (HTTPS) instead. */
function isCloudHost() {
    return (
        isRenderHost() ||
        Boolean(
            process.env.RAILWAY_ENVIRONMENT ||
                process.env.FLY_APP_NAME ||
                process.env.HEROKU_APP_NAME ||
                process.env.VERCEL
        )
    );
}

function usesBrevoApi() {
    return Boolean((process.env.BREVO_API_KEY || "").trim());
}

function isSmtpConfigured() {
    return Boolean(
        process.env.SMTP_HOST &&
            process.env.SMTP_USER &&
            process.env.SMTP_PASS
    );
}

function isEmailConfigured() {
    if (usesBrevoApi()) {
        return Boolean((process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL || "").trim());
    }

    // Cloud hosts block SMTP — only Brevo HTTPS API works there
    if (isCloudHost()) {
        return false;
    }

    return isSmtpConfigured();
}

function getEmailProvider() {
    if (usesBrevoApi()) return "brevo-api";
    if (isCloudHost()) return "none (set BREVO_API_KEY — SMTP blocked on this host)";
    if (isSmtpConfigured()) return `smtp (${process.env.SMTP_HOST})`;
    return "none";
}

function getEmailDiagnostics() {
    return {
        provider: getEmailProvider(),
        configured: isEmailConfigured(),
        brevoApiKeySet: usesBrevoApi(),
        smtpConfigured: isSmtpConfigured(),
        emailFromSet: Boolean((process.env.EMAIL_FROM || "").trim()),
        cloudHost: isCloudHost(),
        renderHost: isRenderHost(),
        missing: getMissingEmailVars(),
    };
}

function getMissingEmailVars() {
    if (isCloudHost()) {
        const missing = [];
        if (!usesBrevoApi()) missing.push("BREVO_API_KEY");
        if (!process.env.EMAIL_FROM) missing.push("EMAIL_FROM");
        return missing;
    }

    if (usesBrevoApi()) {
        const missing = [];
        if (!process.env.BREVO_API_KEY) missing.push("BREVO_API_KEY");
        if (!process.env.EMAIL_FROM) missing.push("EMAIL_FROM");
        return missing;
    }

    const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];
    return required.filter((key) => !process.env[key]);
}

module.exports = {
    isEmailConfigured,
    isSmtpConfigured,
    usesBrevoApi,
    isRenderHost,
    isCloudHost,
    getEmailProvider,
    getEmailDiagnostics,
    getMissingEmailVars,
};
