const {
    getClientIp,
    isIpOnTrustedNetwork,
    getAccessLevel,
    maskClientIp,
    isNetworkAdmin,
} = require("../utils/networkTrust");

async function attachNetworkContext(req, _res, next) {
    try {
        const clientIp = getClientIp(req);
        const result = await isIpOnTrustedNetwork(clientIp);

        req.clientIp = clientIp;
        req.trustedNetworkConfigured = Boolean(result.config);
        req.isTrustedNetwork = result.trusted;
        req.trustedNetworkConfig = result.config;
        req.currentNetworkId = result.config?._id || null;
        req.networkAccessLevel = getAccessLevel({
            configured: Boolean(result.config),
            trusted: result.trusted,
        });
        req.maskedClientIp = maskClientIp(clientIp);

        if (req.user?.id && result.config) {
            req.isNetworkAdmin = isNetworkAdmin(result.config, req.user.id);
        } else {
            req.isNetworkAdmin = false;
        }

        next();
    } catch (err) {
        next(err);
    }
}

module.exports = attachNetworkContext;
