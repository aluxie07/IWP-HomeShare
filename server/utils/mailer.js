const nodemailer = require("nodemailer");
const {
    isEmailConfigured,
    usesBrevoApi,
    isCloudHost,
    getEmailProvider,
} = require("./emailConfig");
const { sendViaBrevoApi, verifyBrevoApi } = require("./brevoApi");

const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS) || 20000;

const smtpSocketOptions = {
    family: 4,
};

function smtpAuth() {
    return {
        user: (process.env.SMTP_USER || "").trim(),
        pass: (process.env.SMTP_PASS || "").replace(/\s+/g, ""),
    };
}

function smtpPort() {
    const port = Number(process.env.SMTP_PORT) || 587;
    return port === 465 ? 587 : port;
}

function createTransporter() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return null;
    }

    if (isCloudHost()) {
        return null;
    }

    const port = smtpPort();
    const host = process.env.SMTP_HOST.trim();

    const timeout = {
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
    };

    const isGmail =
        host === "smtp.gmail.com" || smtpAuth().user.endsWith("@gmail.com");

    if (isGmail) {
        return nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: smtpAuth(),
            pool: false,
            ...smtpSocketOptions,
            ...timeout,
        });
    }

    return nodemailer.createTransport({
        host,
        port,
        secure: false,
        requireTLS: true,
        auth: smtpAuth(),
        pool: false,
        tls: { minVersion: "TLSv1.2" },
        ...smtpSocketOptions,
        ...timeout,
    });
}

function getEmailErrorMessage(err) {
    const msg = err.message || "";

    if (isCloudHost() && !usesBrevoApi()) {
        return (
            "Email not sent: this host blocks SMTP. Add BREVO_API_KEY + EMAIL_FROM (see server/SMTP.md)."
        );
    }

    if (msg.includes("ENETUNREACH") || msg.includes("EAIFNOSUPPORT")) {
        return (
            "SMTP could not reach the mail server (IPv6/network). Use BREVO_API_KEY instead of Gmail SMTP, or set SMTP_PORT=587."
        );
    }

    if (msg.includes("Application-specific password required") || msg.includes("Invalid login")) {
        return "SMTP login rejected. Check SMTP_USER and SMTP_PASS.";
    }

    if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
        return "SMTP timed out. On Render use BREVO_API_KEY (HTTPS), not SMTP.";
    }

    return `Could not send email: ${msg}`;
}

async function verifySmtpConnection() {
    if (usesBrevoApi()) {
        return verifyBrevoApi();
    }

    if (isCloudHost()) {
        return {
            ok: false,
            message: "On this host set BREVO_API_KEY (SMTP ports are blocked).",
        };
    }

    const transporter = createTransporter();
    if (!transporter) {
        return { ok: false, message: "SMTP not configured for this host" };
    }

    try {
        await transporter.verify();
        return { ok: true, message: "SMTP connection verified (IPv4)" };
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

async function sendMail({ to, subject, text, html }) {
    if (usesBrevoApi()) {
        console.log("[HomeShare] Sending email via Brevo API (HTTPS)");
        return sendViaBrevoApi({ to, subject, text, html });
    }

    if (isCloudHost()) {
        throw new Error(
            "SMTP is blocked on this host. Set BREVO_API_KEY and EMAIL_FROM in environment variables."
        );
    }

    const transporter = createTransporter();
    const from = (process.env.EMAIL_FROM || process.env.SMTP_USER || "").trim();

    if (!transporter) {
        return { sent: false, skipped: true };
    }

    console.log(`[HomeShare] Sending email via SMTP (${process.env.SMTP_HOST}:587 IPv4)`);
    await transporter.sendMail({ from, to, subject, text, html });
    return { sent: true, provider: "smtp" };
}

module.exports = {
    createTransporter,
    getEmailErrorMessage,
    verifySmtpConnection,
    sendMail,
    isEmailConfigured,
    getEmailProvider,
};
