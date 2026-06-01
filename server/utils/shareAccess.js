const crypto = require("crypto");

function generateShareToken() {
    return crypto.randomBytes(24).toString("hex");
}

function getShareExpiry(expiresInHours) {
    if (!expiresInHours || Number(expiresInHours) <= 0) {
        return null;
    }
    return new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000);
}

function validateShareAccess(file) {
    if (!file?.shareToken) {
        return { ok: false, status: 404, message: "Share link is invalid or has been revoked." };
    }

    if (file.shareExpiresAt && file.shareExpiresAt <= new Date()) {
        return {
            ok: false,
            status: 410,
            message: "This share link has expired.",
            code: "SHARE_EXPIRED",
        };
    }

    if (
        file.shareMaxDownloads != null &&
        file.shareDownloadCount >= file.shareMaxDownloads
    ) {
        return {
            ok: false,
            status: 403,
            message: "This share link has reached its download limit.",
            code: "SHARE_LIMIT_REACHED",
        };
    }

    return { ok: true, file };
}

function buildShareUrl(token) {
    const base = process.env.CLIENT_URL || "http://localhost:3000";
    return `${base}?share=${token}`;
}

module.exports = {
    generateShareToken,
    getShareExpiry,
    validateShareAccess,
    buildShareUrl,
};
