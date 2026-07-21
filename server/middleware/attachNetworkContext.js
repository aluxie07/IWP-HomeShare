const { getClientIp, maskClientIp } = require("../utils/networkTrust");

/** Attach client IP for Local Only checks — no trusted-network registry. */
async function attachNetworkContext(req, _res, next) {
    try {
        const clientIp = getClientIp(req);
        req.clientIp = clientIp;
        req.maskedClientIp = maskClientIp(clientIp);
        // Legacy fields kept so older clients don't crash; always "open"
        req.trustedNetworkConfigured = false;
        req.isTrustedNetwork = false;
        req.trustedNetworkConfig = null;
        req.currentNetworkId = null;
        req.networkAccessLevel = "unconfigured";
        req.isNetworkAdmin = false;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = attachNetworkContext;
