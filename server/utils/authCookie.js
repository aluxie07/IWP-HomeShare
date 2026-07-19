const COOKIE_NAME = "homeshare_token";

function parseExpiresToMs(expiresIn = "24h") {
    const match = String(expiresIn).trim().match(/^(\d+)([smhd])$/i);
    if (!match) {
        return 24 * 60 * 60 * 1000;
    }
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * (multipliers[unit] || 3_600_000);
}

function isCrossSiteCookie() {
    if ((process.env.COOKIE_SAMESITE || "").trim().toLowerCase() === "none") {
        return true;
    }
    const clientUrl = process.env.CLIENT_URL || "";
    try {
        const host = new URL(clientUrl).hostname;
        return host.endsWith(".github.io");
    } catch {
        return false;
    }
}

function getAuthCookieOptions() {
    const crossSite = isCrossSiteCookie();
    const secureEnv = (process.env.COOKIE_SECURE || "").trim().toLowerCase();
    const secure =
        secureEnv === "true" ||
        crossSite ||
        process.env.NODE_ENV === "production";

    return {
        httpOnly: true,
        secure,
        sameSite: crossSite ? "none" : "lax",
        path: "/",
        maxAge: parseExpiresToMs(process.env.JWT_EXPIRES_IN || "24h"),
    };
}

function setAuthCookie(res, token) {
    res.cookie(COOKIE_NAME, token, getAuthCookieOptions());
}

function clearAuthCookie(res) {
    const options = getAuthCookieOptions();
    res.clearCookie(COOKIE_NAME, {
        httpOnly: options.httpOnly,
        secure: options.secure,
        sameSite: options.sameSite,
        path: options.path,
    });
}

function readAuthToken(req) {
    if (req.cookies && req.cookies[COOKIE_NAME]) {
        return req.cookies[COOKIE_NAME];
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        return authHeader.split(" ")[1];
    }

    return null;
}

module.exports = {
    COOKIE_NAME,
    setAuthCookie,
    clearAuthCookie,
    readAuthToken,
    getAuthCookieOptions,
};
