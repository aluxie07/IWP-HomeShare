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

const FOLDER_UPLOAD_LABEL = "Explorer (folder)";

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

function isUnderDir(filePath, dir) {
    const resolved = path.resolve(filePath);
    return resolved === dir || resolved.startsWith(dir + path.sep);
}

/**
 * Import disk files into Mongo for this owner, and soft-delete DB rows whose
 * Explorer files were deleted. Used by Refresh and the folder watcher.
 *
 * Fast path: one directory listing, one File query, batched owner lookup,
 * insertMany for new files — no per-file findOne.
 */
async function reconcileExplorerFolder(ownerId, networkId = null) {
    if ((process.env.FILE_STORAGE || "").trim().toLowerCase() !== "disk") {
        return { imported: 0, removed: 0, skipped: true };
    }

    const { filesDir } = setupExplorerFolder();
    fs.mkdirSync(filesDir, { recursive: true });
    const resolvedDir = path.resolve(filesDir);

    let dirents;
    try {
        dirents = fs.readdirSync(resolvedDir, { withFileTypes: true });
    } catch (err) {
        console.warn(`[HomeShare] Folder sync readdir failed: ${err.message}`);
        return { imported: 0, removed: 0, skipped: false, filesDir: resolvedDir };
    }

    const onDisk = [];
    for (const d of dirents) {
        if (!d.isFile() || shouldSkipName(d.name)) {
            continue;
        }
        onDisk.push({
            name: d.name,
            full: path.resolve(resolvedDir, d.name),
        });
    }

    const diskPaths = new Set(onDisk.map((f) => f.full));

    const diskRecords = await File.find({
        storageKind: "disk",
        deletedAt: null,
    });

    const knownPaths = new Set();
    const knownNames = new Set();
    for (const file of diskRecords) {
        if (file.storagePath) {
            knownPaths.add(path.resolve(file.storagePath));
        }
        if (file.storedFilename) {
            knownNames.add(file.storedFilename);
        }
    }

    const toRemove = [];
    for (const file of diskRecords) {
        const stored = file.storagePath
            ? path.resolve(file.storagePath)
            : path.resolve(resolvedDir, file.storedFilename || "");

        if (!isUnderDir(stored, resolvedDir)) {
            continue;
        }

        if (!diskPaths.has(stored)) {
            toRemove.push(file);
        }
    }

    let removed = 0;
    if (toRemove.length > 0) {
        const ownerIds = [
            ...new Set(
                toRemove
                    .map((f) => (f.owner ? String(f.owner) : null))
                    .filter(Boolean)
            ),
        ];
        const owners =
            ownerIds.length > 0
                ? await User.find({ _id: { $in: ownerIds } })
                      .select("username")
                      .lean()
                : [];
        const ownerNameById = new Map(
            owners.map((o) => [String(o._id), o.username])
        );

        for (const file of toRemove) {
            const ownerKey = file.owner ? String(file.owner) : "";
            const ownerUsername = ownerNameById.get(ownerKey);
            await softDeleteFile(file, {
                userId: file.owner || null,
                username: ownerUsername
                    ? `${ownerUsername} (folder)`
                    : FOLDER_UPLOAD_LABEL,
            });
            removed += 1;
        }
    }

    const toImport = onDisk.filter(
        (diskFile) =>
            !knownPaths.has(diskFile.full) && !knownNames.has(diskFile.name)
    );

    let imported = 0;
    if (toImport.length > 0) {
        const docs = [];
        for (const diskFile of toImport) {
            let size = 0;
            try {
                size = fs.statSync(diskFile.full).size;
            } catch {
                continue;
            }
            markInternalWrite(diskFile.full);
            docs.push({
                filename: diskFile.name,
                storedFilename: diskFile.name,
                owner: ownerId,
                uploadedByUsername: FOLDER_UPLOAD_LABEL,
                fileSize: size,
                fileType: guessMime(diskFile.name),
                storageKind: "disk",
                storagePath: diskFile.full,
                accessMode: "private",
                ...(networkId ? { networkId } : {}),
            });
        }
        if (docs.length > 0) {
            await File.insertMany(docs, { ordered: false });
            imported = docs.length;
        }
    }

    return { imported, removed, skipped: false, filesDir: resolvedDir };
}

module.exports = {
    reconcileExplorerFolder,
    guessMime,
    shouldSkipName,
    FOLDER_UPLOAD_LABEL,
};
