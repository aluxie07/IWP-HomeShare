const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/dashboard", authMiddleware, (req, res) => {
    res.status(200).json({
        message: "Welcome to your dashboard",
        user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
        },
    });
});

module.exports = router;
