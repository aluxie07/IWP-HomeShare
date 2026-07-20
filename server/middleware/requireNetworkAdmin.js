const User = require("../models/User");
const { isNetworkAdmin } = require("../utils/networkTrust");

/**
 * Network settings may only be changed by the user who first registered
 * this subnet, or a global server admin.
 */
async function requireNetworkAdmin(req, res, next) {
    if (!req.user?.id) {
        return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role === "admin") {
        next();
        return;
    }

    const user = await User.findById(req.user.id).select("role");
    if (user?.role === "admin") {
        req.user.role = user.role;
        next();
        return;
    }

    const config = req.trustedNetworkConfig;
    if (!config) {
        return res.status(403).json({
            message: "Connect from your Wi-Fi and register the network first.",
            code: "NETWORK_NOT_REGISTERED",
        });
    }

    if (!isNetworkAdmin(config, req.user.id)) {
        return res.status(403).json({
            message:
                "Only the person who first registered this network can change its settings.",
            code: "NETWORK_ADMIN_REQUIRED",
        });
    }

    next();
}

module.exports = requireNetworkAdmin;
