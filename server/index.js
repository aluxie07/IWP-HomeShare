require("dotenv").config();

const mongoose = require("mongoose");

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const accountRoutes = require("./routes/account");
const fileRoutes = require("./routes/files");
const shareRoutes = require("./routes/shares");
const { isEmailConfigured, getMissingEmailVars } = require("./utils/emailConfig");
const { verifySmtpConnection } = require("./utils/mailer");

const app = express();

function getAllowedOrigins() {
    const origins = new Set([
        "http://localhost:3000",
        "http://localhost:8080",
    ]);

    if (process.env.CLIENT_URL) {
        try {
            origins.add(new URL(process.env.CLIENT_URL).origin);
        } catch {
            // ignore invalid CLIENT_URL
        }
    }

    if (process.env.ALLOWED_ORIGINS) {
        process.env.ALLOWED_ORIGINS.split(",").forEach((origin) => {
            const trimmed = origin.trim();
            if (trimmed) {
                origins.add(trimmed);
            }
        });
    }

    return [...origins];
}

app.use(
    cors({
        origin(origin, callback) {
            if (!origin || getAllowedOrigins().includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error("Not allowed by CORS"));
        },
    })
);
app.use(express.json());
app.use(authRoutes);
app.use(dashboardRoutes);
app.use(accountRoutes);
app.use(fileRoutes);
app.use(shareRoutes);

mongoose
    .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => {
        console.error("MongoDB connection failed:", err.message);
        console.error(
            "Atlas tips: Network Access → add your current public IP (or 0.0.0.0/0 for dev only), " +
                "confirm the cluster is not paused, and verify MONGO_URI user/password."
        );
    });

app.get("/", (req, res) => {
    res.send("Backend running");
});

app.get("/health", (req, res) => {
    const mongoConnected = mongoose.connection.readyState === 1;
    res.status(mongoConnected ? 200 : 503).json({
        ok: mongoConnected,
        mongo: mongoConnected ? "connected" : "disconnected",
    });
});

app.get("/health/smtp", async (req, res) => {
    const result = await verifySmtpConnection();
    res.status(result.ok ? 200 : 503).json(result);
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (isEmailConfigured()) {
        console.log("Email: configured — testing connection…");
        verifySmtpConnection().then((result) => {
            if (result.ok) {
                console.log(`Email: ${result.message}`);
            } else {
                console.error(`Email: ${result.message}`);
                console.error("See server/SMTP.md (use BREVO_API_KEY on Render free tier).");
            }
        });
    } else {
        console.warn(
            `Email: SMTP not configured (missing: ${getMissingEmailVars().join(", ")}). Activation links will only print in logs.`
        );
    }
});