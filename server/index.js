require("dotenv").config();

const mongoose = require("mongoose");

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const accountRoutes = require("./routes/account");
const { isEmailConfigured, getMissingEmailVars } = require("./utils/emailConfig");

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

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (isEmailConfigured()) {
        console.log("Email: SMTP configured — activation emails will be sent.");
    } else {
        console.warn(
            `Email: SMTP not configured (missing: ${getMissingEmailVars().join(", ")}). Activation links will only print in this terminal.`
        );
    }
});