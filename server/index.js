if (!process.env.HOMESHARE_DATA_DIR) {
    require("dotenv").config();
    require("dotenv").config({ path: require("path").join(__dirname, ".env.shards") });
}

const {
    normalizeMongoUri,
    describeMongoUri,
    maskMongoUri,
    logAtlasNetworkHints,
} = require("./utils/mongoUri");
process.env.MONGO_URI = normalizeMongoUri(process.env.MONGO_URI);

// Local disk mode: create HomeShare Explorer folder BEFORE loading upload routes
if ((process.env.FILE_STORAGE || "").trim().toLowerCase() === "disk") {
    try {
        const { setupExplorerFolder } = require("./utils/explorerFolder");
        const explorer = setupExplorerFolder();
        process.env.HOMESHARE_EXPLORER_DIR = explorer.root;
        process.env.HOMESHARE_UPLOADS_DIR = explorer.filesDir;
        console.log(`[HomeShare] Explorer folder ready: ${explorer.root}`);
    } catch (err) {
        console.warn(`[HomeShare] Explorer folder setup failed: ${err.message}`);
    }
}

const mongoose = require("mongoose");

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const accountRoutes = require("./routes/account");
const fileRoutes = require("./routes/files");
const folderRoutes = require("./routes/folders");
const shareRoutes = require("./routes/shares");
const networkRoutes = require("./routes/network");
const attachNetworkContext = require("./middleware/attachNetworkContext");
const {
    isEmailConfigured,
    getMissingEmailVars,
    getEmailProvider,
    getEmailDiagnostics,
} = require("./utils/emailConfig");
const { verifySmtpConnection } = require("./utils/mailer");
const { getStorageMode, shouldUseDisk, areCloudShardsConfigured } = require("./utils/fileStorage");
const { getFolderShareInfo } = require("./utils/folderShare");
const { isRecaptchaRequired } = require("./middleware/verifyRecaptcha");
const { getUploadsDir } = require("./utils/appPaths");
const { migrateLegacyUploadsToExplorer } = require("./utils/migrateUploads");
const { startExplorerWatcher } = require("./utils/explorerWatcher");

const app = express();
app.set("trust proxy", 1);

function getAllowedOrigins() {
    const origins = new Set([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        // Live site must be able to probe this local API from the browser
        "https://aluxie07.github.io",
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

function isLocalDiskMode() {
    return (process.env.FILE_STORAGE || "").trim().toLowerCase() === "disk";
}

function isAllowedOrigin(origin) {
    if (!origin) {
        return true;
    }
    if (getAllowedOrigins().includes(origin)) {
        return true;
    }
    // Local Network Mode: allow any GitHub Pages / localhost frontend
    if (isLocalDiskMode()) {
        try {
            const { hostname, protocol } = new URL(origin);
            if (hostname === "localhost" || hostname === "127.0.0.1") {
                return true;
            }
            if (hostname.endsWith(".github.io") && protocol === "https:") {
                return true;
            }
            // Same-LAN frontends during lab testing
            if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)) {
                return true;
            }
        } catch {
            return false;
        }
    }
    return false;
}

// Chrome Private Network Access: HTTPS public site (GitHub Pages) → http://127.0.0.1
// Always allow on this local server so Detect / health work from the live site.
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    next();
});

app.use(
    cors({
        origin(origin, callback) {
            if (isAllowedOrigin(origin)) {
                callback(null, true);
                return;
            }
            // Reject without throwing (throwing becomes a 500 and breaks Detect)
            callback(null, false);
        },
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);
app.use(express.json());
app.use(require("cookie-parser")());
app.use(attachNetworkContext);
app.use(authRoutes);
app.use(dashboardRoutes);
app.use(accountRoutes);
app.use(fileRoutes);
app.use(folderRoutes);
app.use(shareRoutes);
app.use(networkRoutes);

const mongoUri = normalizeMongoUri(process.env.MONGO_URI);
const mongoInfo = describeMongoUri(mongoUri);

if (!mongoInfo.valid) {
    console.error("MongoDB: invalid MONGO_URI.");
    mongoInfo.warnings.forEach((w) => console.error(`  - ${w}`));
    if (process.env.HOMESHARE_DATA_DIR) {
        console.error(
            `  Edit or delete: ${require("path").join(process.env.HOMESHARE_DATA_DIR, ".env")} then run Start HomeShare.bat again.`
        );
    }
} else {
    console.log(`MongoDB: connecting to ${maskMongoUri(mongoUri)}`);
    mongoInfo.warnings.forEach((w) => console.warn(`MongoDB warning: ${w}`));
}

mongoose
    .connect(mongoUri, { serverSelectionTimeoutMS: 15000 })
    .then(() => console.log("MongoDB Connected"))
    .catch(async (err) => {
        console.error("MongoDB connection failed:", err.message);
        console.error(`  Configured URI: ${maskMongoUri(mongoUri)}`);
        mongoInfo.warnings.forEach((w) => console.error(`  - ${w}`));
        await logAtlasNetworkHints();
        console.error(
            "  If the URI is wrong, delete .env and re-run Start HomeShare.bat, or edit:" +
                (process.env.HOMESHARE_DATA_DIR
                    ? ` ${require("path").join(process.env.HOMESHARE_DATA_DIR, ".env")}`
                    : " server/.env")
        );
    });

app.get("/", (req, res) => {
    res.send("Backend running");
});

app.get("/health", (req, res) => {
    const mongoConnected = mongoose.connection.readyState === 1;
    const storageMode = getStorageMode();
    const payload = {
        ok: mongoConnected,
        mongo: mongoConnected ? "connected" : "disconnected",
        storageMode,
        storageScope: storageMode === "disk" ? "local" : "cloud",
        email: getEmailDiagnostics(),
        recaptchaRequired: isRecaptchaRequired(),
    };

    if (shouldUseDisk()) {
        try {
            payload.folderShare = getFolderShareInfo();
        } catch {
            payload.folderShare = { enabled: false };
        }
    }

    res.status(mongoConnected ? 200 : 503).json(payload);
});

/** Public on local disk servers — join instructions for other PCs on the LAN */
app.get("/local/share-info", (req, res) => {
    if (!shouldUseDisk()) {
        return res.status(200).json({
            enabled: false,
            message: "Folder sharing is only available when the local disk server is running.",
        });
    }

    try {
        res.status(200).json(getFolderShareInfo());
    } catch (err) {
        res.status(500).json({
            enabled: false,
            message: err.message || "Could not load share info",
        });
    }
});

app.get("/health/smtp", async (req, res) => {
    const result = await verifySmtpConnection();
    res.status(result.ok ? 200 : 503).json(result);
});

app.get("/health/email", (req, res) => {
    res.json(getEmailDiagnostics());
});

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`);
    if (shouldUseDisk()) {
        const { listLanIpv4 } = require("./utils/folderShare");
        const { ensureWindowsFirewallRule } = require("./utils/windowsFirewall");
        const lanIps = listLanIpv4();
        if (lanIps.length > 0) {
            console.log("Other devices on this Wi-Fi — connect the website to:");
            lanIps.forEach((ip) => console.log(`  http://${ip}:${PORT}`));
        } else {
            console.log(
                `Other devices: find this PC's LAN IP (ipconfig) and use http://YOUR-IP:${PORT}`
            );
        }
        const fw = ensureWindowsFirewallRule(PORT);
        if (fw.created) {
            console.log(`Windows Firewall: opened inbound TCP ${PORT} for LAN access.`);
        } else if (fw.ok === false) {
            console.warn(`Windows Firewall: ${fw.message}`);
        }
    }
    console.log(`Email: provider = ${getEmailProvider()}`);
    const storageMode = getStorageMode();
    const storageLabel =
        storageMode === "disk"
            ? "local disk"
            : storageMode === "shards"
              ? "erasure shards (R2+B2+E2)"
              : "gridfs (MongoDB)";
    console.log(
        `Files: storage = ${storageLabel} (FILE_STORAGE=${process.env.FILE_STORAGE || "auto"}, shardsConfigured=${areCloudShardsConfigured()})`
    );

    if (shouldUseDisk()) {
        console.log(`Files: upload folder = ${getUploadsDir()}`);
        migrateLegacyUploadsToExplorer()
            .then(({ moved, targetDir }) => {
                if (moved > 0) {
                    console.log(
                        `Files: moved ${moved} legacy upload(s) into Explorer folder (${targetDir})`
                    );
                }
                startExplorerWatcher();
            })
            .catch((err) => {
                console.warn(`Files: migration skipped (${err.message})`);
                startExplorerWatcher();
            });
    }

    const diagnostics = getEmailDiagnostics();
    if (diagnostics.cloudHost && diagnostics.smtpConfigured && !diagnostics.brevoApiKeySet) {
        console.error(
            "Email: SMTP_* vars are set on a cloud host but will not work. Remove SMTP_* and set BREVO_API_KEY + EMAIL_FROM (see server/SMTP.md)."
        );
    }

    if (isEmailConfigured()) {
        verifySmtpConnection().then((result) => {
            if (result.ok) {
                console.log(`Email: ${result.message}`);
            } else {
                console.error(`Email: ${result.message}`);
            }
        });
    } else {
        console.warn(
            `Email: not configured (missing: ${getMissingEmailVars().join(", ") || "see server/SMTP.md"}). Activation links print in logs only.`
        );
    }
});