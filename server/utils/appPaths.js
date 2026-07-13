const path = require("path");
const fs = require("fs");
const os = require("os");

function isLocalDiskMode() {
    return Boolean(
        process.env.HOMESHARE_DATA_DIR ||
            process.env.HOMESHARE_EXPLORER_DIR ||
            (process.env.FILE_STORAGE || "").trim().toLowerCase() === "disk"
    );
}

function getDataDir() {
    if (process.env.HOMESHARE_DATA_DIR) {
        return process.env.HOMESHARE_DATA_DIR;
    }

    if (process.pkg) {
        return path.join(process.env.APPDATA || os.homedir(), "HomeShare", "local-server");
    }

    return path.join(__dirname, "..");
}

function getUploadsDir() {
    if (process.env.HOMESHARE_UPLOADS_DIR) {
        return process.env.HOMESHARE_UPLOADS_DIR;
    }

    // Local Network Mode: put uploads in a visible File Explorer folder
    if (isLocalDiskMode()) {
        return path.join(os.homedir(), "HomeShare", "Files");
    }

    return path.join(getDataDir(), "uploads");
}

function ensureDataDir() {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function ensureUploadsDir() {
    const dir = getUploadsDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

module.exports = {
    getDataDir,
    getUploadsDir,
    ensureDataDir,
    ensureUploadsDir,
    isLocalDiskMode,
};
