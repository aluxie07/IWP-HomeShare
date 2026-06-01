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
    return usesBrevoApi() || isSmtpConfigured();
}

function getMissingEmailVars() {
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
    getMissingEmailVars,
};
