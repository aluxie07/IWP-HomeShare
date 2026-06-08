const express = require("express");
const File = require("../models/File");
const {
    fileExists,
    streamFileToResponse,
    isForeignDiskPath,
} = require("../utils/fileStorage");
const requireMongo = require("../middleware/requireMongo");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { validateShareAccess } = require("../utils/shareAccess");
const {
    normalizeAccessMode,
    assertFileNetworkAccess,
} = require("../utils/fileAccess");

const router = express.Router();

async function formatSharedFileInfo(file) {
    const owner = await User.findById(file.owner).select("username");
    return {
        id: file._id,
        filename: file.filename,
        fileSize: file.fileSize,
        fileType: file.fileType,
        uploadDate: file.uploadDate,
        permission: file.sharePermission,
        accessMode: normalizeAccessMode(file.accessMode),
        ownerUsername: owner?.username || "Unknown",
        canDownload: file.sharePermission === "download",
        shareExpiresAt: file.shareExpiresAt,
        downloadsRemaining:
            file.shareMaxDownloads != null
                ? Math.max(0, file.shareMaxDownloads - file.shareDownloadCount)
                : null,
    };
}

router.get("/shared/:token", authMiddleware, async (req, res) => {
    try {
        const token = String(req.params.token || "").trim();
        const file = await File.findOne({ shareToken: token });
        const access = validateShareAccess(file);

        if (!access.ok) {
            return res.status(access.status).json({
                message: access.message,
                code: access.code,
            });
        }

        if (String(access.file.owner) === String(req.user.id)) {
            return res.status(400).json({
                message: "You own this file. Open it from your library instead.",
            });
        }

        const fileInfo = await formatSharedFileInfo(access.file);
        const networkCheck = assertFileNetworkAccess(access.file, {
            isTrustedNetwork: req.isTrustedNetwork,
            configured: req.trustedNetworkConfigured,
        });

        if (!networkCheck.ok) {
            fileInfo.canDownload = false;
            fileInfo.networkBlocked = true;
            fileInfo.networkMessage = networkCheck.message;
        }

        res.status(200).json({
            file: fileInfo,
            network: {
                configured: req.trustedNetworkConfigured,
                isTrustedNetwork: req.isTrustedNetwork,
                accessLevel: req.networkAccessLevel,
            },
        });
    } catch {
        res.status(500).json({ message: "Could not load shared file" });
    }
});

router.get("/shared/:token/download", authMiddleware, requireMongo, async (req, res) => {
    try {
        const token = String(req.params.token || "").trim();
        const file = await File.findOne({ shareToken: token });
        const access = validateShareAccess(file);

        if (!access.ok) {
            return res.status(access.status).json({
                message: access.message,
                code: access.code,
            });
        }

        if (access.file.sharePermission === "view") {
            return res.status(403).json({
                message: "This link is view-only. Download is not allowed.",
                code: "VIEW_ONLY",
            });
        }

        const networkCheck = assertFileNetworkAccess(access.file, {
            isTrustedNetwork: req.isTrustedNetwork,
            configured: req.trustedNetworkConfigured,
        });
        if (!networkCheck.ok) {
            return res.status(networkCheck.status).json({
                message: networkCheck.message,
                code: networkCheck.code,
            });
        }

        if (!(await fileExists(access.file))) {
            const hint = isForeignDiskPath(access.file.storagePath)
                ? "The owner uploaded this file from local dev — they must upload again on the live site."
                : "Ask the owner to upload the file again and create a new share link.";
            return res.status(404).json({
                message: hint,
                code: "FILE_UNAVAILABLE",
            });
        }

        access.file.shareDownloadCount += 1;
        await access.file.save();

        await streamFileToResponse(access.file, res, access.file.filename);
    } catch {
        res.status(500).json({ message: "Could not download shared file" });
    }
});

module.exports = router;
