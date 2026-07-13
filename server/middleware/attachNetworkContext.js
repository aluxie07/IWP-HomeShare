const {
    getClientIp,
    isIpOnTrustedNetwork,
    getAccessLevel,
    maskClientIp,
} = require("../utils/networkTrust");

async function attachNetworkContext(req, _res, next) {
    try {
        const clientIp = getClientIp(req);
        const result = await isIpOnTrustedNetwork(clientIp);

        req.clientIp = clientIp;
        req.trustedNetworkConfigured = result.configured;
        req.isTrustedNetwork = result.trusted;
        req.trustedNetworkConfig = result.config;
        req.networkAccessLevel = getAccessLevel({
            configured: result.configured,
            trusted: result.trusted,
        });
        req.maskedClientIp = maskClientIp(clientIp);

        next();
    } catch (err) {
        next(err);
    }
}

module.exports = attachNetworkContext;
