const { sendMail, getEmailErrorMessage, isEmailConfigured } = require("./mailer");

class EmailSendError extends Error {
    constructor(message) {
        super(message);
        this.code = "EMAIL_SEND_FAILED";
    }
}

function buildResetLink(token) {
    const base = process.env.CLIENT_URL || "http://localhost:3000";
    return `${base}?reset=${token}`;
}

async function sendPasswordResetEmail(email, token) {
    const link = buildResetLink(token);
    const subject = "Reset your HomeShare password";
    const text = `Reset your password: ${link}\n\nExpires in 1 hour.`;
    const html = `<p><a href="${link}">Reset password</a></p><p>${link}</p>`;

    if (!isEmailConfigured()) {
        console.log(`[HomeShare] Password reset link for ${email}: ${link}`);
        return;
    }

    try {
        await sendMail({ to: email, subject, text, html });
        console.log(`[HomeShare] Password reset email sent to ${email}`);
    } catch (err) {
        console.error("[HomeShare] Failed to send password reset email:", err.message);
        console.log(`[HomeShare] Password reset link for ${email}: ${link}`);
        throw new EmailSendError(getEmailErrorMessage(err));
    }
}

module.exports = sendPasswordResetEmail;
module.exports.EmailSendError = EmailSendError;
