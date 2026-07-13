const express = require("express");
const fs = require("fs");
const File = require("../models/File");
const authMiddleware = require("../middleware/authMiddleware");
const { runUpload, getMaxFileSize, makeStoredFilename } = require("../middleware/upload");
const requireMongo = require("../middleware/requireMongo");
const {
    saveToGridFS,
    fileExists,
    streamFileToResponse,
    isForeignDiskPath,
    shouldUseGridFS,
    deleteStoredFile,
} = require("../utils/fileStorage");
const {
    syncUploadToExplorer,
    removeExplorerFile,
    markInternalWrite,
} = require("../utils/explorerSync");
const { reconcileExplorerFolder } = require("../utils/explorerReconcile");
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

const router = express.Router();

function formatFile(file) {
    const payload = {
        id: file._id,
        filename: file.filename,
        uploadDate: file.uploadDate,
        fileSize: file.fileSize,
        fileType: file.fileType,
        accessMode: normalizeAccessMode(file.accessMode),
    };

    if (file.shareToken) {
        payload.share = {
            expiresAt: file.shareExpiresAt,
            maxDownloads: file.shareMaxDownloads,
            downloadCount: file.shareDownloadCount,
            permission: file.sharePermission,
        };
    }

    return payload;
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

            // Prevent folder watcher from importing this upload as a duplicate
            if (storagePath) {
                markInternalWrite(storagePath);
            }

            if (req.fileStorageMode === "gridfs") {
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

            // Local disk / Local Network Mode: always mirror into HomeShare Explorer folder
            if (storageKind === "disk" || !shouldUseGridFS()) {
                try {
                    const synced = syncUploadToExplorer({
                        sourcePath: req.file.path,
                        buffer: req.file.buffer,
                        originalname: req.file.originalname,
                        storedFilename,
                    });
                    storageKind = "disk";
                    storagePath = synced.explorerPath;
                    // Keep DB storedFilename aligned with Explorer file name
                    // so downloads resolve correctly
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
                filename: req.file.originalname,
                storedFilename: storagePath
                    ? path.basename(storagePath)
                    : storedFilename,
                owner: req.user.id,
                fileSize: req.file.size,
                fileType: req.file.mimetype,
                storageKind,
                gridfsId,
                storagePath,
                accessMode,
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

router.get("/files", authMiddleware, async (req, res) => {
    try {
        const files = await File.find({ owner: req.user.id }).sort({ uploadDate: -1 });
        res.status(200).json({
            files: files.map(formatFile),
        });
    } catch {
        res.status(500).json({ message: "Could not load files" });
    }
});

router.post("/files/sync-folder", authMiddleware, requireMongo, async (req, res) => {
    try {
        if (shouldUseGridFS()) {
            return res.status(200).json({
                message: "Folder sync is only available in local disk mode",
                imported: 0,
                removed: 0,
                skipped: true,
            });
        }

        const result = await reconcileExplorerFolder(req.user.id);
        const files = await File.find({ owner: req.user.id }).sort({
            uploadDate: -1,
        });

        res.status(200).json({
            message:
                result.imported || result.removed
                    ? `Synced: ${result.imported} added, ${result.removed} removed`
                    : "Library is up to date with HomeShare\\Files",
            ...result,
            files: files.map(formatFile),
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

        if (!file) {
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

        if (!file) {
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
    if (file.storageKind !== "gridfs" && !file.gridfsId) {
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

        if (!file) {
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
        const file = await File.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });

        if (!file) {
            return res.status(404).json({ message: "File not found" });
        }

        removeExplorerFile(file);
        await deleteStoredFile(file);
        await file.deleteOne();

        res.status(200).json({ message: "File deleted" });
    } catch (err) {
        console.error("[HomeShare] Delete failed:", err.message);
        res.status(500).json({ message: "Could not delete file" });
    }
});

router.get("/files/:id/download", authMiddleware, requireMongo, async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });

        if (!file) {
            return res.status(404).json({ message: "File not found" });
        }

        const networkCheck = assertFileNetworkAccess(file, {
            isTrustedNetwork: req.isTrustedNetwork,
            configured: req.trustedNetworkConfigured,
        });
        if (!networkCheck.ok) {
            return res.status(networkCheck.status).json({
                message: networkCheck.message,
                code: networkCheck.code,
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
