const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/User");

const router = express.Router();

router.get("/dashboard", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("username email role");

        res.status(200).json({
            message: "Welcome to your dashboard",
            user: user
                ? {
                      id: user._id,
                      username: user.username,
                      email: user.email,
                      role: user.role || "user",
                  }
                : {
                      id: req.user.id,
                      username: req.user.username,
                      email: req.user.email,
                      role: req.user.role || "user",
                  },
            network: {
                clientIp: req.maskedClientIp,
            },
        });
    } catch {
        res.status(500).json({ message: "Could not load dashboard" });
    }
});

module.exports = router;
