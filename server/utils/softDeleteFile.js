const {
    removeExplorerFile,
} = require("./explorerSync");
const { deleteStoredFile } = require("./fileStorage");

/**
 * Remove file bytes from disk/cloud/Explorer but keep the Mongo document
 * as a library audit log entry.
 */
async function softDeleteFile(file, { userId = null, username = "Unknown" } = {}) {
    if (file.deletedAt) {
        return file;
    }

    try {
        removeExplorerFile(file);
    } catch (err) {
        console.warn(`[HomeShare] Explorer remove on soft-delete: ${err.message}`);
    }

    try {
        await deleteStoredFile(file);
    } catch (err) {
        console.warn(`[HomeShare] Storage remove on soft-delete: ${err.message}`);
    }

    file.deletedAt = new Date();
    file.deletedBy = userId || undefined;
    file.deletedByUsername = username || "Unknown";
    file.storagePath = undefined;
    file.gridfsId = undefined;
    file.shards = [];
    file.chunks = [];
    file.shardMeta = undefined;
    file.shareToken = undefined;
    file.shareExpiresAt = undefined;
    file.shareMaxDownloads = undefined;
    file.shareDownloadCount = 0;
    file.sharePermission = "download";

    await file.save();
    return file;
}

function isFileDeleted(file) {
    return Boolean(file && file.deletedAt);
}

module.exports = {
    softDeleteFile,
    isFileDeleted,
};
