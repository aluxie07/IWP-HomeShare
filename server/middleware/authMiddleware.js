const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { readAuthToken } = require("../utils/authCookie");
const { hashSessionToken } = require("../utils/sessionToken");

async function authMiddleware(req, res, next) {
    const token = readAuthToken(req);

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ message: "Server configuration error" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select(
            "sessionTokenHash role username email"
        );

        if (!user || !user.sessionTokenHash) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (user.sessionTokenHash !== hashSessionToken(token)) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        req.user = {
            id: decoded.id,
            username: user.username || decoded.username,
            email: user.email || decoded.email,
            role: user.role || decoded.role || "user",
        };

        next();
    } catch {
        return res.status(401).json({ message: "Unauthorized" });
    }
}

module.exports = authMiddleware;
