const User = require("../models/User");

async function requireAdmin(req, res, next) {
    if (!req.user?.id) {
        return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role === "admin") {
        next();
        return;
    }

    const user = await User.findById(req.user.id).select("role");
    if (!user || user.role !== "admin") {
        return res.status(403).json({
            message: "Administrator access required",
            code: "ADMIN_REQUIRED",
        });
    }

    req.user.role = user.role;
    next();
}

module.exports = requireAdmin;
