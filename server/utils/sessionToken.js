const crypto = require("crypto");

function hashSessionToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}

module.exports = { hashSessionToken };
