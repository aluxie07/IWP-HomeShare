function isEmailConfigured() {
    return Boolean(
        process.env.SMTP_HOST &&
            process.env.SMTP_USER &&
            process.env.SMTP_PASS
    );
}

function getMissingEmailVars() {
    const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];
    return required.filter((key) => !process.env[key]);
}

module.exports = { isEmailConfigured, getMissingEmailVars };
