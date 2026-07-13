const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { ensureDataDir } = require("./utils/appPaths");

const dataDir = ensureDataDir();
const envPath = path.join(dataDir, ".env");

process.env.HOMESHARE_DATA_DIR = dataDir;
process.env.FILE_STORAGE = process.env.FILE_STORAGE || "disk";
process.env.PORT = process.env.PORT || "8080";
process.env.SKIP_RECAPTCHA = process.env.SKIP_RECAPTCHA || "true";

const DEFAULT_CLIENT_URL = "https://aluxie07.github.io/IWP-HomeShare";

function buildDefaultEnv() {
    return [
        "# HomeShare local server — edit MONGO_URI then restart this app",
        "FILE_STORAGE=disk",
        "SKIP_RECAPTCHA=true",
        "PORT=8080",
        `CLIENT_URL=${DEFAULT_CLIENT_URL}`,
        `ALLOWED_ORIGINS=${DEFAULT_CLIENT_URL},http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080,http://127.0.0.1:8080`,
        "JWT_SECRET=change-this-to-a-long-random-string",
        "MONGO_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/homeshare",
        "",
        "# Optional email (Brevo API):",
        "# BREVO_API_KEY=xkeysib-...",
        "# EMAIL_FROM=your-verified-sender@example.com",
        "",
        "# Optional — make this email an admin:",
        "# ADMIN_EMAIL=you@example.com",
        "",
        "# Files dropped into HomeShare\\Files are owned by this account:",
        "# LOCAL_SYNC_OWNER_EMAIL=you@example.com",
        "",
    ].join("\n");
}

function openEnvEditor() {
    if (process.platform !== "win32") {
        return;
    }

    try {
        spawn("notepad.exe", [envPath], { detached: true, stdio: "ignore" }).unref();
    } catch {
        // ignore
    }
}

if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, buildDefaultEnv(), "utf8");
    console.log("");
    console.log("  First-time setup");
    console.log("  ================");
    console.log(`  Config created: ${envPath}`);
    console.log("  1. Set MONGO_URI to your MongoDB Atlas connection string");
    console.log("  2. Save the file and run HomeShare-Local.exe again");
    console.log("");
    openEnvEditor();
    process.exit(0);
}

const envContents = fs.readFileSync(envPath, "utf8");
if (
    envContents.includes("USER:PASSWORD@cluster") ||
    envContents.includes("change-this-to-a-long-random-string")
) {
    console.warn("");
    console.warn("  Warning: finish setup in .env (MONGO_URI and JWT_SECRET), then restart.");
    console.warn(`  Config file: ${envPath}`);
    console.warn("");
}

require("dotenv").config({ path: envPath });

if (!process.env.MONGO_URI || process.env.MONGO_URI.includes("USER:PASSWORD")) {
    console.error("");
    console.error("  MONGO_URI is not configured.");
    console.error(`  Edit ${envPath} and restart.`);
    console.error("");
    openEnvEditor();
    process.exit(1);
}

process.chdir(dataDir);

try {
    const { setupExplorerFolder } = require("./utils/explorerFolder");
    const explorer = setupExplorerFolder();
    process.env.HOMESHARE_UPLOADS_DIR = explorer.filesDir;
    process.env.HOMESHARE_EXPLORER_DIR = explorer.root;
    console.log("");
    console.log("  HomeShare Local Server");
    console.log("  ======================");
    console.log(`  Config: ${envPath}`);
    console.log(`  Files in Explorer: ${explorer.root}`);
    console.log(`  API: http://127.0.0.1:${process.env.PORT || 8080}`);
    console.log("  Look for HomeShare in Quick Access / on your Desktop.");
    console.log("  Keep this window open. On the website click Detect local server.");
    console.log("");
} catch (err) {
    console.log("");
    console.log("  HomeShare Local Server");
    console.log("  ======================");
    console.log(`  Data folder: ${dataDir}`);
    console.log(`  API: http://127.0.0.1:${process.env.PORT || 8080}`);
    console.log(`  Explorer folder setup skipped: ${err.message}`);
    console.log("  Keep this window open. On the website click Detect local server.");
    console.log("");
}

require("./index.js");
