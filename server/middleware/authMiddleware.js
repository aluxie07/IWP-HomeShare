const jwt = require("jsonwebtoken");
const { setLastSyncOwnerId } = require("../utils/syncOwner");

function authMiddleware(req, res, next) {
    // Step 1: Read token from request headers
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ message: "Server configuration error" });
    }

    // Step 2: Verify token using JWT_SECRET
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Step 3: If valid — allow request
        req.user = decoded;
        if (decoded?.id) {
            setLastSyncOwnerId(decoded.id);
        }
        next();
    } catch (err) {
        // Step 4: If invalid — deny access
        return res.status(401).json({ message: "Unauthorized" });
    }
}

module.exports = authMiddleware;
