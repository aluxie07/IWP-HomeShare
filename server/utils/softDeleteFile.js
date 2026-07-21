const {
    removeExplorerFile,
} = require("./explorerSync");
const { deleteStoredFile } = require("./fileStorage");

/**
 * Remove file bytes from disk/cloud/Explorer but keep the Mongo document
 * as a library audit log entry.
 *
 * Mark deleted in Mongo first so the Explorer watcher cannot race and
 * overwrite deletedBy with the last sync / admin user.
 */
async function softDeleteFile(file, { userId = null, username = "Unknown" } = {}) {
    if (file.deletedAt) {
        return file;
    }

    // Snapshot paths before clearing — cleanup runs after the DB write.
    const storageSnapshot = {
        storagePath: file.storagePath,
        storedFilename: file.storedFilename,
        filename: file.filename,
        storageKind: file.storageKind,
        gridfsId: file.gridfsId,
        shards: file.shards,
        chunks: file.chunks,
        shardMeta: file.shardMeta,
    };

    file.deletedAt = new Date();
    file.deletedBy = userId || undefined;
    file.deletedByUsername = username || "Unknown";
    file.shareToken = undefined;
    file.shareExpiresAt = undefined;
    file.shareMaxDownloads = undefined;
    file.shareDownloadCount = 0;
    file.sharePermission = "download";
    file.storagePath = undefined;
    file.gridfsId = undefined;
    file.shards = [];
    file.chunks = [];
    file.shardMeta = undefined;

    await file.save();

    try {
        removeExplorerFile(storageSnapshot);
    } catch (err) {
        console.warn(`[HomeShare] Explorer remove on soft-delete: ${err.message}`);
    }

    try {
        await deleteStoredFile(storageSnapshot);
    } catch (err) {
        console.warn(`[HomeShare] Storage remove on soft-delete: ${err.message}`);
    }

    return file;
}

function isFileDeleted(file) {
    return Boolean(file && file.deletedAt);
}

module.exports = {
    softDeleteFile,
    isFileDeleted,
};
