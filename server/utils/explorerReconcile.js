const fs = require("fs");
const path = require("path");
const File = require("../models/File");
const User = require("../models/User");
const { setupExplorerFolder } = require("./explorerFolder");
const { markInternalWrite } = require("./explorerSync");
const { softDeleteFile } = require("./softDeleteFile");

const IGNORE_NAMES = new Set([
    "readme.txt",
    "desktop.ini",
    "thumbs.db",
    ".ds_store",
]);

function guessMime(filename) {
    const ext = path.extname(filename || "").toLowerCase();
    const map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".csv": "text/csv",
        ".json": "application/json",
        ".zip": "application/zip",
        ".jar": "application/java-archive",
        ".mp4": "video/mp4",
        ".mp3": "audio/mpeg",
        ".doc": "application/msword",
        ".docx":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    return map[ext] || "application/octet-stream";
}

function shouldSkipName(base) {
    if (!base || base.startsWith(".")) {
        return true;
    }
    return IGNORE_NAMES.has(base.toLowerCase());
}

/**
 * Import disk files into Mongo for this owner, and soft-delete DB rows whose
 * Explorer files were deleted. Used by Refresh and the folder watcher.
 */
async function reconcileExplorerFolder(ownerId) {
    if ((process.env.FILE_STORAGE || "").trim().toLowerCase() !== "disk") {
        return { imported: 0, removed: 0, skipped: true };
    }

    const { filesDir } = setupExplorerFolder();
    fs.mkdirSync(filesDir, { recursive: true });
    const resolvedDir = path.resolve(filesDir);

    const onDisk = fs
        .readdirSync(resolvedDir, { withFileTypes: true })
        .filter((d) => d.isFile() && !shouldSkipName(d.name))
        .map((d) => {
            const full = path.resolve(resolvedDir, d.name);
            const stats = fs.statSync(full);
            return {
                name: d.name,
                full,
                size: stats.size,
            };
        });

    const diskPaths = new Set(onDisk.map((f) => f.full));

    const ownerFiles = await File.find({
        owner: ownerId,
        storageKind: "disk",
        deletedAt: null,
    });

    const actor = await User.findById(ownerId).select("username");
    const actorName = actor?.username || "Unknown";

    let removed = 0;
    for (const file of ownerFiles) {
        const stored = file.storagePath
            ? path.resolve(file.storagePath)
            : path.resolve(resolvedDir, file.storedFilename || "");

        const inExplorer =
            stored.startsWith(resolvedDir + path.sep) || stored === resolvedDir;

        if (!inExplorer) {
            continue;
        }

        if (!diskPaths.has(stored) && !fs.existsSync(stored)) {
            await softDeleteFile(file, {
                userId: ownerId,
                username: `${actorName} (folder)`,
            });
            removed += 1;
        }
    }

    let imported = 0;
    for (const diskFile of onDisk) {
        const existing = await File.findOne({
            deletedAt: null,
            $or: [
                { storagePath: diskFile.full },
                {
                    owner: ownerId,
                    storedFilename: diskFile.name,
                    storageKind: "disk",
                },
            ],
        });

        if (existing) {
            // Local PC: claim Explorer files for whoever hits Refresh
            if (
                String(existing.owner) !== String(ownerId) &&
                existing.storagePath &&
                path.resolve(existing.storagePath) === diskFile.full
            ) {
                existing.owner = ownerId;
                if (!existing.uploadedByUsername) {
                    existing.uploadedByUsername = actorName;
                }
                await existing.save();
            }
            continue;
        }

        markInternalWrite(diskFile.full);
        await File.create({
            filename: diskFile.name,
            storedFilename: diskFile.name,
            owner: ownerId,
            uploadedByUsername: actorName,
            fileSize: diskFile.size,
            fileType: guessMime(diskFile.name),
            storageKind: "disk",
            storagePath: diskFile.full,
            accessMode: "private",
        });
        imported += 1;
    }

    return { imported, removed, skipped: false, filesDir: resolvedDir };
}

module.exports = {
    reconcileExplorerFolder,
    guessMime,
    shouldSkipName,
};
