const nodemailer = require("nodemailer");
const { isEmailConfigured } = require("./emailConfig");

const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS) || 15000;

function createTransporter() {
    if (!isEmailConfigured()) {
        return null;
    }

    const timeout = {
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
    };

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
            ...timeout,
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
        ...timeout,
    });
}

function getEmailErrorMessage(err) {
    const msg = err.message || "";

    if (msg.includes("Application-specific password required") || msg.includes("Invalid login")) {
        return (
            "Gmail rejected the login. Use a Google App Password at " +
            "https://myaccount.google.com/apppasswords"
        );
    }

    if (msg.includes("timeout") || msg.includes("ETIMEDOUT") || msg.includes("ECONNRESET")) {
        return (
            "Email server timed out. Gmail SMTP often fails on cloud hosts like Render—use " +
            "Brevo/SendGrid SMTP or check Render logs for the activation link."
        );
    }

    return "Could not send email. Check SMTP settings on the server.";
}

async function sendMail({ to, subject, text, html }) {
    const transporter = createTransporter();
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

    if (!transporter) {
        return { sent: false, skipped: true };
    }

    await transporter.sendMail({ from, to, subject, text, html });
    return { sent: true };
}

module.exports = {
    createTransporter,
    getEmailErrorMessage,
    sendMail,
    isEmailConfigured,
};
