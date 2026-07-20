const path = require("path");
const os = require("os");
const { ensureDataDir } = require("./utils/appPaths");
const { needsSetup, runSetupWizard } = require("./utils/setupWizard");
const { normalizeMongoUri } = require("./utils/mongoUri");

function getPackagedDataDir() {
    return path.join(process.env.APPDATA || os.homedir(), "HomeShare", "local-server");
}

async function main() {
    const dataDir = getPackagedDataDir();
    process.env.HOMESHARE_DATA_DIR = dataDir;
    ensureDataDir();
    const envPath = path.join(dataDir, ".env");

    process.env.FILE_STORAGE = process.env.FILE_STORAGE || "disk";
    process.env.PORT = process.env.PORT || "8080";
    process.env.SKIP_RECAPTCHA = process.env.SKIP_RECAPTCHA || "true";

    if (needsSetup(envPath)) {
        console.log("");
        console.log("  HomeShare needs a quick first-time setup.");
        console.log("");
        const ok = await runSetupWizard(envPath);
        if (!ok) {
            console.error("  Setup cancelled. Run Start HomeShare.bat again when ready.");
            process.exit(1);
        }
    }

    require("dotenv").config({ path: envPath });
    process.env.MONGO_URI = normalizeMongoUri(process.env.MONGO_URI);
    // Always disk for the Windows local package — never GridFS/cloud shards
    process.env.FILE_STORAGE = "disk";

    if (!process.env.MONGO_URI || process.env.MONGO_URI.includes("USER:PASSWORD")) {
        console.error("");
        console.error("  MONGO_URI is still missing. Re-run setup.");
        console.error(`  Config file: ${envPath}`);
        console.error("");
        const ok = await runSetupWizard(envPath);
        if (!ok) {
            process.exit(1);
        }
        require("dotenv").config({ path: envPath, override: true });
        process.env.MONGO_URI = normalizeMongoUri(process.env.MONGO_URI);
        process.env.FILE_STORAGE = "disk";
    }

    if (
        !process.env.JWT_SECRET ||
        process.env.JWT_SECRET.includes("change-this")
    ) {
        console.error("  JWT_SECRET is invalid. Re-run setup.");
        process.exit(1);
    }

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
        if (explorer.folderShare?.preferredUnc || explorer.folderShare?.uncPaths?.[0]) {
            console.log(
                `  Shared folder: ${explorer.folderShare.preferredUnc || explorer.folderShare.uncPaths[0]}`
            );
            console.log("  Other PCs: paste that path in File Explorer to join the same folder.");
        } else if (explorer.folderShare && !explorer.folderShare.enabled) {
            console.log(
                "  Folder share: run as Administrator once if others cannot map \\\\YOUR-IP\\HomeShare"
            );
        }
        console.log(`  API: http://127.0.0.1:${process.env.PORT || 8080}`);
        console.log("  Look for HomeShare in Quick Access / on your Desktop.");
        console.log("  Keep this window open. On the website click Detect local server.");
        console.log("");
    } catch (err) {
        console.log("");
        console.log("  HomeShare Local Server");
        console.log("  ======================");
        console.log(`  Config: ${envPath}`);
        console.log(`  API: http://127.0.0.1:${process.env.PORT || 8080}`);
        console.log(`  Explorer folder setup skipped: ${err.message}`);
        console.log("  Keep this window open. On the website click Detect local server.");
        console.log("");
    }

    require("./index.js");
}

main().catch((err) => {
    console.error("  Failed to start HomeShare:", err.message || err);
    process.exit(1);
});
