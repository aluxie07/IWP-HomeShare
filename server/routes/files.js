const express = require("express");
const path = require("path");
const fs = require("fs");
const File = require("../models/File");
const authMiddleware = require("../middleware/authMiddleware");
const { upload, MAX_FILE_SIZE } = require("../middleware/upload");

const router = express.Router();

function formatFile(file) {
    return {
        id: file._id,
        filename: file.filename,
        uploadDate: file.uploadDate,
        fileSize: file.fileSize,
        fileType: file.fileType,
    };
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

        const record = await File.create({
            filename: req.file.originalname,
            storedFilename: req.file.filename,
            owner: req.user.id,
            fileSize: req.file.size,
            fileType: req.file.mimetype,
            storagePath: req.file.path,
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

router.get("/files/:id/download", authMiddleware, async (req, res) => {
    try {
        const file = await File.findOne({
            _id: req.params.id,
            owner: req.user.id,
        });

        if (!file) {
            return res.status(404).json({ message: "File not found" });
        }

        if (!fs.existsSync(file.storagePath)) {
            return res.status(404).json({ message: "File no longer exists on disk" });
        }

        res.download(path.resolve(file.storagePath), file.filename);
    } catch {
        res.status(500).json({ message: "Could not download file" });
    }
});

module.exports = router;
