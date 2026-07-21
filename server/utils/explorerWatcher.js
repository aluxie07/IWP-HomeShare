const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const File = require("../models/File");
const User = require("../models/User");
const { setupExplorerFolder } = require("./explorerFolder");
const { isInternalWrite, markInternalWrite } = require("./explorerSync");
const { getLastSyncOwnerId } = require("./syncOwner");
const { guessMime, shouldSkipName } = require("./explorerReconcile");

const FOLDER_UPLOAD_LABEL = "Explorer (folder)";

function shouldSkip(filePath) {
    const base = path.basename(filePath);
    if (shouldSkipName(base)) {
        return true;
    }
    if (filePath.includes(`${path.sep}.homeshare${path.sep}`)) {
        return true;
    }
    return false;
}

/** ACL owner for anonymous folder drops only — never used as upload/delete credit. */
async function resolveSyncOwner() {
    const lastId = getLastSyncOwnerId();
    if (lastId) {
        const recent = await User.findById(lastId);
        if (recent) {
            return recent;
        }
    }

    const email = (
        process.env.LOCAL_SYNC_OWNER_EMAIL ||
        process.env.ADMIN_EMAIL ||
        ""
    )
        .trim()
        .toLowerCase();

    if (email) {
        const byEmail = await User.findOne({ email });
        if (byEmail) {
            return byEmail;
        }
    }

    const admin = await User.findOne({ role: "admin" }).sort({ _id: 1 });
    if (admin) {
        return admin;
    }

    return User.findOne().sort({ _id: 1 });
}

async function findFileForPath(filePath) {
    const resolved = path.resolve(filePath);
    const name = path.basename(resolved);

    return File.findOne({
        deletedAt: null,
        $or: [
            { storagePath: resolved },
            { storedFilename: name, storageKind: "disk" },
        ],
    });
}

async function onFileAdded(filePath) {
    if (shouldSkip(filePath) || isInternalWrite(filePath)) {
        return;
    }

    await new Promise((r) => setTimeout(r, 400));

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return;
    }

    if (isInternalWrite(filePath)) {
        return;
    }

    const existing = await findFileForPath(filePath);
    if (existing) {
        return;
    }

    const owner = await resolveSyncOwner();
    if (!owner) {
        console.warn(
            "[HomeShare] Explorer sync: no user account to own dropped files. Open the website while logged in, or set LOCAL_SYNC_OWNER_EMAIL."
        );
        return;
    }

    const stats = fs.statSync(filePath);
    const basename = path.basename(filePath);

    markInternalWrite(filePath);

    await File.create({
        filename: basename,
        storedFilename: basename,
        owner: owner._id,
        // Do not credit the last logged-in / admin user as the uploader
        uploadedByUsername: FOLDER_UPLOAD_LABEL,
        fileSize: stats.size,
        fileType: guessMime(basename),
        storageKind: "disk",
        storagePath: path.resolve(filePath),
        accessMode: "private",
    });

    console.log(
        `[HomeShare] Explorer → server: imported "${basename}" (folder drop; ACL owner ${owner.username})`
    );
}

async function onFileRemoved(filePath) {
    if (shouldSkip(filePath) || isInternalWrite(filePath)) {
        return;
    }

    const existing = await findFileForPath(filePath);
    if (!existing || existing.deletedAt) {
        return;
    }

    const { softDeleteFile } = require("./softDeleteFile");

    let deletedByUsername = FOLDER_UPLOAD_LABEL;
    let userId = existing.owner || null;

    if (existing.owner) {
        const ownerDoc = await User.findById(existing.owner).select("username");
        if (ownerDoc?.username) {
            // File was removed from the shared folder — credit the file owner,
            // not whoever last used the website / admin email.
            deletedByUsername = `${ownerDoc.username} (folder)`;
            userId = ownerDoc._id;
        }
    }

    await softDeleteFile(existing, {
        userId,
        username: deletedByUsername,
    });
    console.log(
        `[HomeShare] Explorer → server: soft-deleted "${existing.filename}" (removed from folder)`
    );
}

function startExplorerWatcher() {
    if ((process.env.FILE_STORAGE || "").trim().toLowerCase() !== "disk") {
        return null;
    }

    if (process.env.HOMESHARE_FOLDER_SYNC === "false") {
        console.log("[HomeShare] Explorer folder sync disabled");
        return null;
    }

    const { filesDir } = setupExplorerFolder();
    fs.mkdirSync(filesDir, { recursive: true });

    const isWin = process.platform === "win32";
    const watcher = chokidar.watch(filesDir, {
        ignored: /(^|[/\\])\../,
        persistent: true,
        // Initial scan can race Mongo; Refresh does a full reconcile instead.
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 800,
            pollInterval: 200,
        },
        depth: 0,
        // Windows Explorer copy/move often misses native FS events
        usePolling: isWin,
        interval: isWin ? 1000 : undefined,
    });

    watcher.on("add", (p) => {
        onFileAdded(p).catch((err) =>
            console.warn(`[HomeShare] Explorer add sync failed: ${err.message}`)
        );
    });

    watcher.on("unlink", (p) => {
        onFileRemoved(p).catch((err) =>
            console.warn(`[HomeShare] Explorer delete sync failed: ${err.message}`)
        );
    });

    watcher.on("ready", () => {
        console.log(
            `[HomeShare] Watching Explorer folder (${isWin ? "polling" : "native"}): ${filesDir}`
        );
    });

    watcher.on("error", (err) => {
        console.warn(`[HomeShare] Explorer watcher error: ${err.message}`);
    });

    return watcher;
}

module.exports = {
    startExplorerWatcher,
    FOLDER_UPLOAD_LABEL,
};
