const express = require("express");
const fs = require("fs");
const mongoose = require("mongoose");
const File = require("../models/File");
const authMiddleware = require("../middleware/authMiddleware");
const { runUpload, getMaxFileSize, makeStoredFilename } = require("../middleware/upload");
const requireMongo = require("../middleware/requireMongo");
const {
    saveToGridFS,
    saveToCloudShards,
    fileExists,
    streamFileToResponse,
    isForeignDiskPath,
    shouldUseDisk,
    getStorageMode,
    makeExplorerFilename,
} = require("../utils/fileStorage");
const { saveChunkToCloudShards } = require("../utils/cloudShards");
const {
    DEFAULT_CHUNK_SIZE,
    createUploadSession,
    getUploadSession,
    completeUploadSession,
    abortUploadSession,
    cleanupSessionFiles,
} = require("../utils/uploadSessions");
const {
    syncUploadToExplorer,
    markInternalWrite,
} = require("../utils/explorerSync");
const { reconcileExplorerFolder } = require("../utils/explorerReconcile");
const { ensureUploadsDir } = require("../utils/appPaths");
const path = require("path");
const {
    generateShareToken,
    getShareExpiry,
    buildShareUrl,
} = require("../utils/shareAccess");
const {
    normalizeAccessMode,
    allowsShareLinks,
    assertFileNetworkAccess,
    ACCESS_MODES,
} = require("../utils/fileAccess");
const { softDeleteFile, isFileDeleted } = require("../utils/softDeleteFile");

const router = express.Router();
const CHUNK_BODY_LIMIT = DEFAULT_CHUNK_SIZE + 1024 * 1024;

function formatFile(file) {
    const ownerDoc = file.owner && typeof file.owner === "object" ? file.owner : null;
    const deletedByDoc =
        file.deletedBy && typeof file.deletedBy === "object" ? file.deletedBy : null;
    const deleted = isFileDeleted(file);

    const payload = {
        id: file._id,
        filename: file.filename,
        uploadDate: file.uploadDate,
        fileSize: file.fileSize,
        fileType: file.fileType,
        accessMode: normalizeAccessMode(file.accessMode),
        uploadedBy:
            file.uploadedByUsername ||
            ownerDoc?.username ||
            null,
        deleted: deleted,
        deletedAt: file.deletedAt || null,
        deletedBy:
            file.deletedByUsername ||
            deletedByDoc?.username ||
            null,
    };

    if (!deleted && file.shareToken) {
        payload.share = {
            expiresAt: file.shareExpiresAt,
            maxDownloads: file.shareMaxDownloads,
            downloadCount: file.shareDownloadCount,
            permission: file.sharePermission,
        };
    }

    return payload;
}

function libraryListQuery(userId, networkId) {
    if (networkId) {
        return {
            $or: [{ owner: userId }, { networkId }],
        };
    }
    return { owner: userId };
}

function isFileOwner(file, userId) {
    const ownerId = file.owner?._id || file.owner;
    return String(ownerId) === String(userId);
}

function isSameNetwork(file, networkId) {
    if (!networkId || !file.networkId) {
        return false;
    }
    return String(file.networkId) === String(networkId);
}

function canAccessFileDownload(file, user, networkContext) {
    if (isFileDeleted(file)) {
        return { ok: false, status: 404, message: "File not found" };
    }
    const networkId = networkContext?.networkId || null;
    if (!isFileOwner(file, user.id) && !isSameNetwork(file, networkId)) {
        return { ok: false, status: 404, message: "File not found" };
    }
    return assertFileNetworkAccess(file, networkContext);
}

function sortLibraryFiles(files) {
    return [...files].sort((a, b) => {
        const aDeleted = Boolean(a.deletedAt);
        const bDeleted = Boolean(b.deletedAt);
        if (aDeleted !== bDeleted) {
            return aDeleted ? 1 : -1;
        }
        if (aDeleted) {
            return new Date(b.deletedAt) - new Date(a.deletedAt);
        }
        return new Date(b.uploadDate) - new Date(a.uploadDate);
    });
}

async function loadLibraryFiles(userId, networkId) {
    const files = await File.find(libraryListQuery(userId, networkId))
        .populate("owner", "username")
        .populate("deletedBy", "username");
    return sortLibraryFiles(files).map(formatFile);
}

function currentNetworkId(req) {
    return req.currentNetworkId || null;
}

function canDeleteFile(file, user, networkId) {
    if (isFileOwner(file, user.id)) {
        return true;
    }
    if (user.role === "admin") {
        return true;
    }
    if (isSameNetwork(file, networkId)) {
        const mode = normalizeAccessMode(file.accessMode);
        return mode === "shared" || mode === "local_only";
    }
    return false;
}

router.post(
    "/files/upload",
    authMiddleware,
    requireMongo,
    (req, res, next) => {
        runUpload(req, res, (err) => {
            if (err) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    const maxBytes = getMaxFileSize();
                    const maxLabel = maxBytes
                        ? `${Math.round(maxBytes / (1024 * 1024))} MB`
                        : "unlimited";
                    return res.status(400).json({
                        message: `File is too large. Maximum size is ${maxLabel}.`,
                    });
                }
                return res.status(400).json({ message: err.message || "Upload failed" });
            }
            next();
        });
    },
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ message: "No file provided" });
            }

            const storedFilename =
                req.file.filename || makeStoredFilename(req.file.originalname);
            let storageKind = "disk";
            let storagePath = req.file.path;
            let gridfsId;
            let shards;
            let shardMeta;
            let chunks;
            const fileId = new mongoose.Types.ObjectId();

            // Prevent folder watcher from importing this upload as a duplicate
            if (storagePath) {
                markInternalWrite(storagePath);
            }

            if (req.fileStorageMode === "shards") {
                const shardResult = await saveToCloudShards(
                    String(fileId),
                    req.file.buffer
                );
                storageKind = shardResult.storageKind;
                shards = shardResult.shards;
                shardMeta = shardResult.shardMeta;
                chunks = shardResult.chunks;
                storagePath = undefined;
            } else if (req.fileStorageMode === "gridfs") {
                const gridMeta = await saveToGridFS(
                    storedFilename,
                    req.file.buffer,
                    req.file.mimetype
                );
                storageKind = gridMeta.storageKind;
                gridfsId = gridMeta.gridfsId;
                storagePath = undefined;
            }

            const accessMode = normalizeAccessMode(req.body?.accessMode);

            // Local disk / Local Network Mode: mirror into HomeShare Explorer folder
            if (storageKind === "disk" || shouldUseDisk()) {
                try {
                    const synced = syncUploadToExplorer({
                        sourcePath: req.file.path,
                        buffer: req.file.buffer,
                        originalname: req.file.originalname,
                        storedFilename,
                    });
                    storageKind = "disk";
                    storagePath = synced.explorerPath;
                    console.log(
                        `[HomeShare] Synced upload to Explorer: ${synced.explorerPath}`
                    );
                } catch (syncErr) {
                    console.warn(
                        `[HomeShare] Explorer sync failed: ${syncErr.message}`
                    );
                }
            }

            const record = await File.create({
                _id: fileId,
                filename: req.file.originalname,
                storedFilename: storagePath
                    ? path.basename(storagePath)
                    : storedFilename,
                owner: req.user.id,
                uploadedByUsername: req.user.username,
                fileSize: req.file.size,
                fileType: req.file.mimetype,
                storageKind,
                gridfsId,
                storagePath,
                shards,
                shardMeta,
                chunks,
                accessMode,
                ...(currentNetworkId(req)
                    ? { networkId: currentNetworkId(req) }
                    : {}),
            });

            if (!(await fileExists(record))) {
                return res.status(500).json({
                    message: "File was saved to the database but could not be verified. Try uploading again.",
                });
            }

            res.status(201).json({
                message: "File uploaded successfully",
                file: formatFile(record),
            });
        } catch (err) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            console.error("[HomeShare] Upload failed:", err.message);
            res.status(500).json({ message: err.message || "Upload failed" });
        }
    }
);

// --- Chunked upload (required for large cloud files up to 5GB) ---

router.post("/files/upload/init", authMiddleware, requireMongo, async (req, res) => {
    try {
        const filename = String(req.body?.filename || "").trim();
        const fileSize = Number(req.body?.fileSize);
        const fileType = String(req.body?.fileType || "application/octet-stream");
        const accessMode = normalizeAccessMode(req.body?.accessMode);
        const maxBytes = getMaxFileSize();

        if (!filename || !Number.isFinite(fileSize) || fileSize <= 0) {
            return res.status(400).json({ message: "filename and fileSize are required" });
        }
        if (maxBytes && fileSize > maxBytes) {
            return res.status(400).json({
                message: `File is too large. Maximum size is ${Math.round(maxBytes / (1024 * 1024))} MB.`,
            });
        }

        const storageMode = getStorageMode();
        const fileId = new mongoose.Types.ObjectId();
        const session = createUploadSession({
            userId: req.user.id,
            fileId,
            filename,
            fileSize,
            fileType,
            accessMode,
            storageMode,
            chunkSize: DEFAULT_CHUNK_SIZE,
        });

        res.status(200).json({
            uploadId: session.uploadId,
            fileId: session.fileId,
            chunkSize: session.chunkSize,
            chunkCount: session.chunkCount,
            storageMode: session.storageMode,
        });
    } catch (err) {
        console.error("[HomeShare] Upload init failed:", err.message);
        res.status(500).json({ message: "Could not start upload" });
    }
});

router.put(
    "/files/upload/:uploadId/chunks/:index",
    authMiddleware,
    requireMongo,
    express.raw({ type: "*/*", limit: CHUNK_BODY_LIMIT }),
    async (req, res) => {
        try {
            const session = getUploadSession(req.params.uploadId, req.user.id);
            if (!session) {
                return res.status(404).json({ message: "Upload session not found or expired" });
            }

            const index = Number(req.params.index);
            if (!Number.isInteger(index) || index < 0 || index >= session.chunkCount) {
                return res.status(400).json({ message: "Invalid chunk index" });
            }

            const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
            if (!buffer.length) {
                return res.status(400).json({ message: "Empty chunk" });
            }

            const expected =
                index === session.chunkCount - 1
                    ? session.fileSize - session.chunkSize * (session.chunkCount - 1)
                    : session.chunkSize;
            if (buffer.length !== expected && buffer.length > session.chunkSize) {
                return res.status(400).json({
                    message: `Unexpected chunk size (got ${buffer.length}, expected about ${expected})`,
                });
            }

            if (session.storageMode === "shards") {
                const chunkRecord = await saveChunkToCloudShards(
                    session.fileId,
                    index,
                    buffer
                );
                session.chunkRecords.set(index, chunkRecord);
            } else if (session.storageMode === "disk") {
                const chunkPath = path.join(session.tempDir, `chunk-${index}.bin`);
                fs.writeFileSync(chunkPath, buffer);
                session.chunkRecords.set(index, { index, size: buffer.length, path: chunkPath });
            } else {
                // gridfs fallback: stash chunks on disk then assemble
                const chunkPath = path.join(session.tempDir, `chunk-${index}.bin`);
                fs.writeFileSync(chunkPath, buffer);
                session.chunkRecords.set(index, { index, size: buffer.length, path: chunkPath });
            }

            session.received.add(index);
            res.status(200).json({
                message: "Chunk received",
                index,
                received: session.received.size,
                chunkCount: session.chunkCount,
            });
        } catch (err) {
            console.error("[HomeShare] Chunk upload failed:", err.message);
            res.status(500).json({ message: err.message || "Chunk upload failed" });
        }
    }
);

router.post("/files/upload/:uploadId/complete", authMiddleware, requireMongo, async (req, res) => {
    try {
        const session = getUploadSession(req.params.uploadId, req.user.id);
        if (!session) {
            return res.status(404).json({ message: "Upload session not found or expired" });
        }

        if (session.received.size !== session.chunkCount) {
            return res.status(400).json({
                message: `Upload incomplete (${session.received.size}/${session.chunkCount} chunks)`,
            });
        }

        let storageKind = session.storageMode;
        let storagePath;
        let gridfsId;
        let shards;
        let shardMeta;
        let chunks;
        const storedFilename = makeStoredFilename(session.filename);

        if (session.storageMode === "shards") {
            chunks = [...session.chunkRecords.values()].sort((a, b) => a.index - b.index);
            shards = chunks[0]?.shards;
            shardMeta = chunks[0]?.shardMeta;
            storageKind = "shards";
        } else if (session.storageMode === "disk" || shouldUseDisk()) {
            ensureUploadsDir();
            const destName = makeExplorerFilename(session.filename);
            const destPath = path.join(ensureUploadsDir(), destName);
            markInternalWrite(destPath);
            const out = fs.createWriteStream(destPath);
            for (let i = 0; i < session.chunkCount; i += 1) {
                const rec = session.chunkRecords.get(i);
                const data = fs.readFileSync(rec.path);
                out.write(data);
            }
            await new Promise((resolve, reject) => {
                out.end(() => resolve());
                out.on("error", reject);
            });
            storageKind = "disk";
            storagePath = destPath;
        } else {
            // Assemble for GridFS
            const parts = [];
            for (let i = 0; i < session.chunkCount; i += 1) {
                const rec = session.chunkRecords.get(i);
                parts.push(fs.readFileSync(rec.path));
            }
            const buffer = Buffer.concat(parts);
            const gridMeta = await saveToGridFS(storedFilename, buffer, session.fileType);
            storageKind = gridMeta.storageKind;
            gridfsId = gridMeta.gridfsId;
        }

        const record = await File.create({
            _id: new mongoose.Types.ObjectId(session.fileId),
            filename: session.filename,
            storedFilename: storagePath ? path.basename(storagePath) : storedFilename,
            owner: req.user.id,
            uploadedByUsername: req.user.username,
            fileSize: session.fileSize,
            fileType: session.fileType,
            storageKind,
            gridfsId,
            storagePath,
            shards,
            shardMeta,
            chunks,
            accessMode: session.accessMode,
            ...(currentNetworkId(req) ? { networkId: currentNetworkId(req) } : {}),
        });

        cleanupSessionFiles(session);
        completeUploadSession(session.uploadId);

        if (!(await fileExists(record))) {
            return res.status(500).json({
                message: "File was saved but could not be verified. Try uploading again.",
            });
        }

        res.status(201).json({
            message: "File uploaded successfully",
            file: formatFile(record),
        });
    } catch (err) {
        console.error("[HomeShare] Upload complete failed:", err.message);
        res.status(500).json({ message: err.message || "Could not finalize upload" });
    }
});

router.delete("/files/upload/:uploadId", authMiddleware, (req, res) => {
    abortUploadSession(req.params.uploadId);
    res.status(200).json({ message: "Upload cancelled" });
});

router.get("/files", authMiddleware, async (req, res) => {
    try {
        const files = await loadLibraryFiles(req.user.id, currentNetworkId(req));
        res.status(200).json({ files });
    } catch {
        res.status(500).json({ message: "Could not load files" });
    }
});

router.post("/files/sync-folder", authMiddleware, requireMongo, async (req, res) => {
    try {
        if (!shouldUseDisk()) {
            return res.status(200).json({
                message: "Folder sync is only available in local disk mode",
                imported: 0,
                removed: 0,
                skipped: true,
            });
        }

        const result = await reconcileExplorerFolder(
            req.user.id,
            currentNetworkId(req)
        );
        const files = await loadLibraryFiles(req.user.id, currentNetworkId(req));

        res.status(200).json({
            message:
                result.imported || result.removed
                    ? `Synced: ${result.imported} added, ${result.removed} removed`
                    : "Library is up to date with HomeShare\\Files",
            ...result,
            files,
        });
    } catch (err) {
        console.error("[HomeShare] Folder sync failed:", err.message);
        res.status(500).json({ message: "Could not sync Explorer folder" });
    }
});

router.post("/files/:id/share", authMiddleware, async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });

        if (!file || isFileDeleted(file)) {
            return res.status(404).json({ message: "File not found" });
        }

        if (!allowsShareLinks(file)) {
            return res.status(400).json({
                message:
                    "Private files cannot be shared. Change the access mode to Shared or Local Only first.",
                code: "PRIVATE_FILE",
            });
        }

        const { expiresInHours, maxDownloads, viewOnly } = req.body;
        const token = generateShareToken();

        file.shareToken = token;
        file.shareExpiresAt = getShareExpiry(expiresInHours);
        file.shareMaxDownloads =
            maxDownloads != null && maxDownloads !== ""
                ? Math.max(1, Number(maxDownloads))
                : undefined;
        file.shareDownloadCount = 0;
        file.sharePermission = viewOnly ? "view" : "download";

        await file.save();

        const shareUrl = buildShareUrl(token);

        res.status(200).json({
            message: "Share link created",
            shareUrl,
            shareToken: token,
            share: {
                expiresAt: file.shareExpiresAt,
                maxDownloads: file.shareMaxDownloads,
                permission: file.sharePermission,
            },
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(500).json({ message: "Could not generate share link. Try again." });
        }
        res.status(500).json({ message: "Could not create share link" });
    }
});

router.delete("/files/:id/share", authMiddleware, async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });

        if (!file || isFileDeleted(file)) {
            return res.status(404).json({ message: "File not found" });
        }

        file.shareToken = undefined;
        file.shareExpiresAt = undefined;
        file.shareMaxDownloads = undefined;
        file.shareDownloadCount = 0;
        file.sharePermission = "download";
        await file.save();

        res.status(200).json({ message: "Share link revoked" });
    } catch {
        res.status(500).json({ message: "Could not revoke share link" });
    }
});

function fileUnavailableMessage(file) {
    if (isForeignDiskPath(file.storagePath)) {
        return "This file was uploaded from a different environment. Upload it again on the live site.";
    }
    if (file.storageKind === "shards") {
        return "Could not rebuild this file from cloud shards (need at least 3 fragments). Try again later.";
    }
    if (file.storageKind !== "gridfs" && !file.gridfsId && file.storageKind !== "shards") {
        return "This file was stored on server disk and is no longer available. Upload it again.";
    }
    return "File data is missing from storage. Upload the file again.";
}

router.patch("/files/:id/access-mode", authMiddleware, async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });

        if (!file || isFileDeleted(file)) {
            return res.status(404).json({ message: "File not found" });
        }

        const accessMode = normalizeAccessMode(req.body?.accessMode);
        if (!ACCESS_MODES.includes(accessMode)) {
            return res.status(400).json({
                message: "Access mode must be private, shared, or local_only",
            });
        }

        if (accessMode === "private" && file.shareToken) {
            file.shareToken = undefined;
            file.shareExpiresAt = undefined;
            file.shareMaxDownloads = undefined;
            file.shareDownloadCount = 0;
        }

        file.accessMode = accessMode;
        await file.save();

        res.status(200).json({
            message: "Access mode updated",
            file: formatFile(file),
        });
    } catch {
        res.status(500).json({ message: "Could not update access mode" });
    }
});

router.delete("/files/:id", authMiddleware, requireMongo, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);

        if (!file || isFileDeleted(file)) {
            return res.status(404).json({ message: "File not found" });
        }

        if (!canDeleteFile(file, req.user, currentNetworkId(req))) {
            return res.status(403).json({
                message: "You can only delete your own private files, or Shared / Local Only files.",
            });
        }

        await softDeleteFile(file, {
            userId: req.user.id,
            username: req.user.username,
        });

        res.status(200).json({
            message: "File deleted",
            file: formatFile(file),
        });
    } catch (err) {
        console.error("[HomeShare] Delete failed:", err.message);
        res.status(500).json({ message: "Could not delete file" });
    }
});

router.get("/files/:id/download", authMiddleware, requireMongo, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);

        if (!file) {
            return res.status(404).json({ message: "File not found" });
        }

        const access = canAccessFileDownload(file, req.user, {
            isTrustedNetwork: req.isTrustedNetwork,
            configured: req.trustedNetworkConfigured,
            networkId: currentNetworkId(req),
        });
        if (!access.ok) {
            return res.status(access.status).json({
                message: access.message,
                code: access.code,
            });
        }

        if (!(await fileExists(file))) {
            return res.status(404).json({
                message: fileUnavailableMessage(file),
                code: "FILE_UNAVAILABLE",
            });
        }

        await streamFileToResponse(file, res, file.filename);
    } catch (err) {
        console.error("[HomeShare] Download failed:", err.message);
        res.status(500).json({ message: "Could not download file" });
    }
});

module.exports = router;
