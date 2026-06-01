const {
    sendMail,
    getEmailErrorMessage,
    isEmailConfigured,
    getEmailProvider,
} = require("./mailer");

class EmailSendError extends Error {
    constructor(message) {
        super(message);
        this.code = "EMAIL_SEND_FAILED";
    }
}

function buildActivationLink(token) {
    const base = process.env.CLIENT_URL || "http://localhost:3000";
    return `${base}?verify=${token}`;
}

async function sendActivationEmail(email, token) {
    const link = buildActivationLink(token);
    const subject = "Activate your HomeShare account";
    const text = `Welcome to HomeShare!\n\nActivate your account by opening this link:\n${link}\n\nThis link expires in 24 hours.`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px;">
            <h2 style="color: #0066cc;">Welcome to HomeShare</h2>
            <p>Thanks for signing up. <a href="${link}">Activate your account</a></p>
            <p style="color: #666; font-size: 14px;">${link}</p>
        </div>
    `;

    if (!isEmailConfigured()) {
        console.log(`[HomeShare] Activation link for ${email}: ${link}`);
        return { sent: false, link };
    }

    try {
        await sendMail({ to: email, subject, text, html });
        console.log(`[HomeShare] Activation email sent to ${email}`);
        return { sent: true, link };
    } catch (err) {
        console.error(
            `[HomeShare] Failed to send activation email (provider=${getEmailProvider()}):`,
            err.message
        );
        console.log(`[HomeShare] Activation link for ${email}: ${link}`);
        throw new EmailSendError(getEmailErrorMessage(err));
    }
}

module.exports = sendActivationEmail;
module.exports.EmailSendError = EmailSendError;
module.exports.buildActivationLink = buildActivationLink;
