const mongoose = require("mongoose");

function requireMongo(req, res, next) {
    if (mongoose.connection.readyState === 1) {
        next();
        return;
    }

    res.status(503).json({
        message: "Database is not ready. Wait a moment and try again.",
        code: "DB_NOT_READY",
    });
}

module.exports = requireMongo;
