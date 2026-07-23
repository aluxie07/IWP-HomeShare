const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB
const sessions = new Map();

function cleanupExpired() {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
        if (session.expiresAt < now) {
            cleanupSessionFiles(session);
            sessions.delete(id);
        }
    }
}

function cleanupSessionFiles(session) {
    if (session.tempDir && fs.existsSync(session.tempDir)) {
        try {
            fs.rmSync(session.tempDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }
}

function createUploadSession({
    userId,
    fileId,
    filename,
    fileSize,
    fileType,
    accessMode,
    folderId = null,
    storageMode,
    chunkSize = DEFAULT_CHUNK_SIZE,
}) {
    cleanupExpired();

    const uploadId = crypto.randomBytes(16).toString("hex");
    const chunkCount = Math.max(1, Math.ceil(fileSize / chunkSize));
    const tempDir = path.join(os.tmpdir(), "homeshare-uploads", uploadId);
    fs.mkdirSync(tempDir, { recursive: true });

    const session = {
        uploadId,
        userId: String(userId),
        fileId: String(fileId),
        filename,
        fileSize,
        fileType,
        accessMode,
        folderId: folderId ? String(folderId) : null,
        storageMode,
        chunkSize,
        chunkCount,
        received: new Set(),
        chunkRecords: new Map(), // index -> shard metadata (cloud) or path (disk)
        tempDir,
        expiresAt: Date.now() + SESSION_TTL_MS,
    };

    sessions.set(uploadId, session);
    return session;
}

function getUploadSession(uploadId, userId) {
    cleanupExpired();
    const session = sessions.get(uploadId);
    if (!session) {
        return null;
    }
    if (String(session.userId) !== String(userId)) {
        return null;
    }
    if (session.expiresAt < Date.now()) {
        cleanupSessionFiles(session);
        sessions.delete(uploadId);
        return null;
    }
    return session;
}

function completeUploadSession(uploadId) {
    const session = sessions.get(uploadId);
    if (!session) {
        return null;
    }
    sessions.delete(uploadId);
    return session;
}

function abortUploadSession(uploadId) {
    const session = sessions.get(uploadId);
    if (!session) {
        return;
    }
    cleanupSessionFiles(session);
    sessions.delete(uploadId);
}

module.exports = {
    DEFAULT_CHUNK_SIZE,
    createUploadSession,
    getUploadSession,
    completeUploadSession,
    abortUploadSession,
    cleanupSessionFiles,
};
