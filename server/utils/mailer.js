const nodemailer = require("nodemailer");
const { isEmailConfigured, usesBrevoApi } = require("./emailConfig");
const { sendViaBrevoApi, verifyBrevoApi } = require("./brevoApi");

const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS) || 20000;

function smtpAuth() {
    return {
        user: (process.env.SMTP_USER || "").trim(),
        pass: (process.env.SMTP_PASS || "").replace(/\s+/g, ""),
    };
}

function smtpPort() {
    return Number(process.env.SMTP_PORT) || 587;
}

function createTransporter() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return null;
    }

    const port = smtpPort();
    const secure = process.env.SMTP_SECURE === "true" || port === 465;

    const timeout = {
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
    };

    const isGmail =
        process.env.SMTP_HOST === "smtp.gmail.com" ||
        smtpAuth().user.endsWith("@gmail.com");

    if (isGmail) {
        return nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: smtpAuth(),
            pool: false,
            ...timeout,
        });
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST.trim(),
        port,
        secure,
        requireTLS: !secure && port === 587,
        auth: smtpAuth(),
        pool: false,
        tls: { minVersion: "TLSv1.2" },
        ...timeout,
    });
}

function getEmailErrorMessage(err) {
    const msg = err.message || "";

    if (process.env.RENDER && !usesBrevoApi()) {
        return (
            "Email failed: Render free tier blocks SMTP (ports 587/465). " +
            "Add BREVO_API_KEY on Render instead of SMTP (see server/SMTP.md)."
        );
    }

    if (msg.includes("Application-specific password required") || msg.includes("Invalid login")) {
        return "SMTP login rejected. Check SMTP_USER and SMTP_PASS.";
    }

    if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
        return usesBrevoApi()
            ? `Brevo API error: ${msg}`
            : "SMTP timed out. On Render use BREVO_API_KEY, not SMTP.";
    }

    return `Could not send email: ${msg}`;
}

async function verifySmtpConnection() {
    if (usesBrevoApi()) {
        return verifyBrevoApi();
    }

    const transporter = createTransporter();
    if (!transporter) {
        return { ok: false, message: "Email not configured" };
    }

    if (process.env.RENDER) {
        return {
            ok: false,
            message:
                "Render free tier blocks SMTP ports. Set BREVO_API_KEY (HTTPS) in environment variables.",
        };
    }

    try {
        await transporter.verify();
        return { ok: true, message: "SMTP connection verified" };
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

async function sendMail({ to, subject, text, html }) {
    if (usesBrevoApi()) {
        return sendViaBrevoApi({ to, subject, text, html });
    }

    if (process.env.RENDER) {
        throw new Error(
            "Render blocks SMTP on free tier. Set BREVO_API_KEY in Render environment variables."
        );
    }

    const transporter = createTransporter();
    const from = (process.env.EMAIL_FROM || process.env.SMTP_USER || "").trim();

    if (!transporter) {
        return { sent: false, skipped: true };
    }

    await transporter.sendMail({ from, to, subject, text, html });
    return { sent: true, provider: "smtp" };
}

module.exports = {
    createTransporter,
    getEmailErrorMessage,
    verifySmtpConnection,
    sendMail,
    isEmailConfigured,
};
