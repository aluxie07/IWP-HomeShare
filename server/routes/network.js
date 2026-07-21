const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/** Lightweight status for UI — shows the caller's IP (used by Local Only). */
router.get("/network/status", authMiddleware, (req, res) => {
    res.status(200).json({
        clientIp: req.maskedClientIp || "unknown",
        rawClientIp: req.clientIp || null,
        message:
            "Local Only files are limited to the uploader's IP range (same Wi‑Fi / LAN).",
    });
});

module.exports = router;
