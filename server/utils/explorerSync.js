const fs = require("fs");
const path = require("path");
const { setupExplorerFolder, getExplorerFilesDir } = require("./explorerFolder");

/** Paths we wrote ourselves — watcher should ignore briefly */
const ignoreUntil = new Map();

function markInternalWrite(filePath) {
    if (!filePath) {
        return;
    }
    // Long enough to cover Windows polling + upload/delete races
    ignoreUntil.set(path.resolve(filePath), Date.now() + 15000);
}

function isInternalWrite(filePath) {
    const key = path.resolve(filePath);
    const until = ignoreUntil.get(key);
    if (!until) {
        return false;
    }
    if (Date.now() > until) {
        ignoreUntil.delete(key);
        return false;
    }
    return true;
}

function safeDisplayName(originalname) {
    const raw = path.basename(originalname || "file");
    return raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "file";
}

function uniquePath(dir, filename) {
    const ext = path.extname(filename);
    const stem = path.basename(filename, ext) || "file";
    let candidate = path.join(dir, `${stem}${ext}`);
    let n = 1;
    while (fs.existsSync(candidate)) {
        candidate = path.join(dir, `${stem} (${n})${ext}`);
        n += 1;
    }
    return candidate;
}

/**
 * Mirror an uploaded file into %USERPROFILE%\HomeShare\Files
 * so File Explorer stays in sync after every upload.
 */
function syncUploadToExplorer({ sourcePath, buffer, originalname, storedFilename }) {
    const { filesDir } = setupExplorerFolder();
    fs.mkdirSync(filesDir, { recursive: true });

    // Already written into Explorer folder by multer — don't duplicate
    if (
        sourcePath &&
        fs.existsSync(sourcePath) &&
        path.resolve(path.dirname(sourcePath)) === path.resolve(filesDir)
    ) {
        markInternalWrite(sourcePath);
        return {
            explorerPath: path.resolve(sourcePath),
            explorerDir: filesDir,
            displayName: path.basename(sourcePath),
        };
    }

    const display = safeDisplayName(originalname || storedFilename || "file");
    const dest = uniquePath(filesDir, display);

    markInternalWrite(dest);

    if (sourcePath && fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, dest);
        markInternalWrite(sourcePath);
    } else if (buffer && Buffer.isBuffer(buffer)) {
        fs.writeFileSync(dest, buffer);
    } else {
        throw new Error("No file data available to sync into Explorer folder");
    }

    return {
        explorerPath: dest,
        explorerDir: filesDir,
        displayName: path.basename(dest),
    };
}

function removeExplorerFile(file) {
    const candidates = [];
    if (file?.storagePath) {
        candidates.push(file.storagePath);
    }
    if (file?.storedFilename) {
        candidates.push(path.join(getExplorerFilesDir(), file.storedFilename));
        candidates.push(path.join(getExplorerFilesDir(), path.basename(file.filename || "")));
    }
    if (file?.filename) {
        candidates.push(path.join(getExplorerFilesDir(), safeDisplayName(file.filename)));
    }

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        try {
            const resolved = path.resolve(candidate);
            if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
                markInternalWrite(resolved);
                fs.unlinkSync(resolved);
                return resolved;
            }
        } catch {
            // continue
        }
    }
    return null;
}

module.exports = {
    syncUploadToExplorer,
    removeExplorerFile,
    markInternalWrite,
    isInternalWrite,
    getExplorerDir: getExplorerFilesDir,
};
