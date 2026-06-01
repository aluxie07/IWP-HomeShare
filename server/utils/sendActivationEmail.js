const nodemailer = require("nodemailer");
const { isEmailConfigured } = require("./emailConfig");

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

function getEmailErrorMessage(err) {
    const msg = err.message || "";

    if (
        msg.includes("Application-specific password required") ||
        msg.includes("Invalid login")
    ) {
        return (
            "Gmail rejected the login. Use a Google App Password (not your normal Gmail password). " +
            "Enable 2-Step Verification, then create one at https://myaccount.google.com/apppasswords"
        );
    }

    return "Could not send activation email. Check your SMTP settings and try again.";
}

async function sendActivationEmail(email, token) {
    const link = buildActivationLink(token);
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
    const subject = "Activate your HomeShare account";
    const text = `Welcome to HomeShare!\n\nActivate your account by opening this link:\n${link}\n\nThis link expires in 24 hours. If you did not create an account, you can ignore this email.`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px;">
            <h2 style="color: #0066cc;">Welcome to HomeShare</h2>
            <p>Thanks for signing up. Click the button below to activate your account:</p>
            <p style="margin: 24px 0;">
                <a href="${link}" style="background: #0066cc; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
                    Activate account
                </a>
            </p>
            <p style="color: #666; font-size: 14px;">Or copy this link into your browser:<br>${link}</p>
            <p style="color: #666; font-size: 14px;">This link expires in 24 hours.</p>
        </div>
    `;

    const transporter = createTransporter();

    if (!transporter) {
        console.log(`[HomeShare] Activation link for ${email}: ${link}`);
        console.warn(
            "[HomeShare] SMTP is not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM to server/.env to send real emails."
        );
        return;
    }

    try {
        await transporter.sendMail({
            from,
            to: email,
            subject,
            text,
            html,
        });
        console.log(`[HomeShare] Activation email sent to ${email}`);
    } catch (err) {
        console.error("[HomeShare] Failed to send activation email:", err.message);
        throw new EmailSendError(getEmailErrorMessage(err));
    }
}

module.exports = sendActivationEmail;
module.exports.EmailSendError = EmailSendError;
