const nodemailer = require("nodemailer");
const { isEmailConfigured } = require("./emailConfig");

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

function createTransporter() {
    if (!isEmailConfigured()) {
        return null;
    }

    const isGmail =
        process.env.SMTP_HOST === "smtp.gmail.com" ||
        (process.env.SMTP_USER || "").endsWith("@gmail.com");

    if (isGmail) {
        return nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

async function sendPasswordResetEmail(email, token) {
    const link = buildResetLink(token);
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
    const subject = "Reset your HomeShare password";
    const text = `You requested a password reset for HomeShare.\n\nReset your password by opening this link:\n${link}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px;">
            <h2 style="color: #0066cc;">Reset your password</h2>
            <p>You requested a password reset for your HomeShare account.</p>
            <p style="margin: 24px 0;">
                <a href="${link}" style="background: #0066cc; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
                    Reset password
                </a>
            </p>
            <p style="color: #666; font-size: 14px;">Or copy this link into your browser:<br>${link}</p>
            <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you did not request this, ignore this email.</p>
        </div>
    `;

    const transporter = createTransporter();

    if (!transporter) {
        console.log(`[HomeShare] Password reset link for ${email}: ${link}`);
        return;
    }

    try {
        await transporter.sendMail({ from, to: email, subject, text, html });
        console.log(`[HomeShare] Password reset email sent to ${email}`);
    } catch (err) {
        console.error("[HomeShare] Failed to send password reset email:", err.message);
        throw new EmailSendError(
            "Could not send password reset email. Check your SMTP settings and try again."
        );
    }
}

module.exports = sendPasswordResetEmail;
module.exports.EmailSendError = EmailSendError;
