const express = require("express");
const TrustedNetwork = require("../models/TrustedNetwork");
const authMiddleware = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/requireAdmin");
const {
    subnetFromIp,
    isIpv4,
    isPrivateIpv4,
    maskClientIp,
} = require("../utils/networkTrust");

const router = express.Router();

function formatNetworkStatus(req) {
    const config = req.trustedNetworkConfig;

    return {
        configured: req.trustedNetworkConfigured,
        isTrustedNetwork: req.isTrustedNetwork,
        accessLevel: req.networkAccessLevel,
        clientIp: req.maskedClientIp,
        trustedNetwork: config
            ? {
                  label: config.label,
                  subnet: config.subnet,
                  gatewayIp: config.gatewayIp || null,
                  registeredAt: config.registeredAt,
              }
            : null,
        capabilities: {
            localOnlyAccess: req.trustedNetworkConfigured && req.isTrustedNetwork,
            sharedAccess: true,
            privateAccess: true,
        },
    };
}

router.get("/network/status", authMiddleware, (req, res) => {
    res.status(200).json(formatNetworkStatus(req));
});

router.get("/admin/network", authMiddleware, requireAdmin, async (req, res) => {
    try {
        const config = await TrustedNetwork.findOne().sort({ updatedAt: -1 });

        if (!config) {
            return res.status(200).json({
                configured: false,
                currentClientIp: req.maskedClientIp,
                suggestedSubnet: isIpv4(req.clientIp)
                    ? subnetFromIp(req.clientIp)
                    : null,
            });
        }

        res.status(200).json({
            configured: true,
            label: config.label,
            subnet: config.subnet,
            gatewayIp: config.gatewayIp || "",
            registeredFromIp: maskClientIp(config.registeredFromIp),
            registeredAt: config.registeredAt,
            updatedAt: config.updatedAt,
            currentClientIp: req.maskedClientIp,
            isCurrentClientTrusted: req.isTrustedNetwork,
        });
    } catch {
        res.status(500).json({ message: "Could not load trusted network settings" });
    }
});

router.post("/admin/network/register", authMiddleware, requireAdmin, async (req, res) => {
    try {
        const clientIp = req.clientIp;

        if (!isIpv4(clientIp)) {
            return res.status(400).json({
                message:
                    "Could not detect an IPv4 address for this device. Connect over your local Wi-Fi and try again.",
            });
        }

        const { label, gatewayIp, subnet: customSubnet } = req.body || {};
        const subnet = customSubnet?.trim() || subnetFromIp(clientIp);

        if (!subnet) {
            return res.status(400).json({ message: "Could not derive a subnet from your IP address" });
        }

        await TrustedNetwork.deleteMany({});

        const config = await TrustedNetwork.create({
            label: label?.trim() || "Trusted network",
            subnet,
            gatewayIp: gatewayIp?.trim() || undefined,
            registeredFromIp: clientIp,
            registeredBy: req.user.id,
            registeredAt: new Date(),
            updatedAt: new Date(),
        });

        res.status(201).json({
            message: isPrivateIpv4(clientIp)
                ? "Trusted network registered from your current local connection."
                : "Trusted network registered. Note: your current IP does not look like a private LAN address — verify the subnet is correct.",
            config: {
                label: config.label,
                subnet: config.subnet,
                gatewayIp: config.gatewayIp || null,
                registeredFromIp: maskClientIp(config.registeredFromIp),
                registeredAt: config.registeredAt,
            },
        });
    } catch {
        res.status(500).json({ message: "Could not register trusted network" });
    }
});

router.put("/admin/network", authMiddleware, requireAdmin, async (req, res) => {
    try {
        const config = await TrustedNetwork.findOne().sort({ updatedAt: -1 });

        if (!config) {
            return res.status(404).json({
                message: "No trusted network configured. Register the current network first.",
            });
        }

        const { label, subnet, gatewayIp } = req.body || {};

        if (subnet != null) {
            const trimmed = String(subnet).trim();
            if (!trimmed.includes("/")) {
                return res.status(400).json({
                    message: "Subnet must be in CIDR format, e.g. 192.168.1.0/24",
                });
            }
            config.subnet = trimmed;
        }

        if (label != null) {
            config.label = String(label).trim() || config.label;
        }

        if (gatewayIp !== undefined) {
            config.gatewayIp = gatewayIp ? String(gatewayIp).trim() : undefined;
        }

        config.updatedAt = new Date();
        await config.save();

        res.status(200).json({
            message: "Trusted network settings updated",
            config: {
                label: config.label,
                subnet: config.subnet,
                gatewayIp: config.gatewayIp || null,
                updatedAt: config.updatedAt,
            },
        });
    } catch {
        res.status(500).json({ message: "Could not update trusted network settings" });
    }
});

router.delete("/admin/network", authMiddleware, requireAdmin, async (req, res) => {
    try {
        await TrustedNetwork.deleteMany({});
        res.status(200).json({
            message: "Trusted network configuration reset. Local Only restrictions are disabled until a network is registered again.",
        });
    } catch {
        res.status(500).json({ message: "Could not reset trusted network settings" });
    }
});

module.exports = router;
