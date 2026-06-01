const express = require("express");
const fs = require("fs");
const File = require("../models/File");
const authMiddleware = require("../middleware/authMiddleware");
const { upload, MAX_FILE_SIZE, makeStoredFilename } = require("../middleware/upload");
const {
    shouldUseGridFS,
    saveToGridFS,
    fileExists,
    streamFileToResponse,
} = require("../utils/fileStorage");
const {
    generateShareToken,
    getShareExpiry,
    buildShareUrl,
} = require("../utils/shareAccess");

const router = express.Router();

function formatFile(file) {
    const payload = {
        id: file._id,
        filename: file.filename,
        uploadDate: file.uploadDate,
        fileSize: file.fileSize,
        fileType: file.fileType,
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

router.post("/files/upload", authMiddleware, (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({
                    message: `File is too large. Maximum size is ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB.`,
                });
            }
            return res.status(400).json({ message: err.message || "Upload failed" });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file provided" });
        }

        const storedFilename = req.file.filename || makeStoredFilename(req.file.originalname);
        let storageKind = "disk";
        let storagePath = req.file.path;
        let gridfsId;

        if (shouldUseGridFS()) {
            const gridMeta = await saveToGridFS(
                storedFilename,
                req.file.buffer,
                req.file.mimetype
            );
            storageKind = gridMeta.storageKind;
            gridfsId = gridMeta.gridfsId;
            storagePath = undefined;
        }

        const record = await File.create({
            filename: req.file.originalname,
            storedFilename,
            owner: req.user.id,
            fileSize: req.file.size,
            fileType: req.file.mimetype,
            storageKind,
            gridfsId,
            storagePath,
        });

        res.status(201).json({
            message: "File uploaded successfully",
            file: formatFile(record),
        });
    } catch {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: "Upload failed" });
    }
});

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

router.post("/files/:id/share", authMiddleware, async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });

        if (!file) {
            return res.status(404).json({ message: "File not found" });
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

router.get("/files/:id/download", authMiddleware, async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });

        if (!file) {
            return res.status(404).json({ message: "File not found" });
        }

        if (!(await fileExists(file))) {
            return res.status(404).json({
                message:
                    "File is no longer available. It may have been lost after a server restart — upload it again.",
                code: "FILE_UNAVAILABLE",
            });
        }

        await streamFileToResponse(file, res, file.filename);
    } catch {
        res.status(500).json({ message: "Could not download file" });
    }
});

module.exports = router;
