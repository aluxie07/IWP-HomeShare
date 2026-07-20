const express = require("express");
const TrustedNetwork = require("../models/TrustedNetwork");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const requireNetworkAdmin = require("../middleware/requireNetworkAdmin");
const {
    subnetFromIp,
    isIpv4,
    isPrivateIpv4,
    maskClientIp,
    findNetworkBySubnet,
    isNetworkAdmin,
} = require("../utils/networkTrust");

const router = express.Router();

function formatNetworkStatus(req) {
    const config = req.trustedNetworkConfig;
    const suggestedSubnet = isIpv4(req.clientIp) ? subnetFromIp(req.clientIp) : null;

    return {
        configured: Boolean(config),
        isTrustedNetwork: req.isTrustedNetwork,
        accessLevel: req.networkAccessLevel,
        clientIp: req.maskedClientIp,
        suggestedSubnet,
        isNetworkAdmin: Boolean(req.isNetworkAdmin),
        canRegister:
            !config &&
            Boolean(suggestedSubnet) &&
            isPrivateIpv4(req.clientIp),
        trustedNetwork: config
            ? {
                  id: config._id,
                  label: config.label,
                  subnet: config.subnet,
                  gatewayIp: config.gatewayIp || null,
                  registeredAt: config.registeredAt,
                  adminUserId: config.registeredBy,
              }
            : null,
        capabilities: {
            localOnlyAccess: req.isTrustedNetwork,
            sharedAccess: true,
            privateAccess: true,
            networkLibrary: req.isTrustedNetwork,
        },
    };
}

router.get("/network/status", authMiddleware, (req, res) => {
    res.status(200).json(formatNetworkStatus(req));
});

/** Settings for the network matching this device's current IP/subnet */
router.get("/admin/network", authMiddleware, async (req, res) => {
    try {
        const suggestedSubnet = isIpv4(req.clientIp) ? subnetFromIp(req.clientIp) : null;
        const config = req.trustedNetworkConfig;

        if (!config) {
            let subnetTaken = false;
            if (suggestedSubnet) {
                subnetTaken = Boolean(await findNetworkBySubnet(suggestedSubnet));
            }
            return res.status(200).json({
                configured: false,
                currentClientIp: req.maskedClientIp,
                suggestedSubnet,
                subnetAlreadyRegistered: subnetTaken,
                canRegister: Boolean(suggestedSubnet) && isPrivateIpv4(req.clientIp) && !subnetTaken,
                isNetworkAdmin: false,
            });
        }

        const admin = await User.findById(config.registeredBy).select("username");

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
            isNetworkAdmin: isNetworkAdmin(config, req.user.id) || req.user.role === "admin",
            networkAdminUsername: admin?.username || null,
        });
    } catch {
        res.status(500).json({ message: "Could not load network settings" });
    }
});

/** First user on this subnet becomes network admin; later users cannot re-register */
router.post("/admin/network/register", authMiddleware, async (req, res) => {
    try {
        const clientIp = req.clientIp;

        if (!isIpv4(clientIp)) {
            return res.status(400).json({
                message:
                    "Could not detect an IPv4 address for this device. Connect over your local Wi-Fi and try again.",
            });
        }

        if (!isPrivateIpv4(clientIp)) {
            return res.status(400).json({
                message:
                    "Register a network from a private LAN address (e.g. home or office Wi-Fi), not from the public internet.",
            });
        }

        const { label, gatewayIp, subnet: customSubnet } = req.body || {};
        const subnet = customSubnet?.trim() || subnetFromIp(clientIp);

        if (!subnet) {
            return res.status(400).json({ message: "Could not derive a subnet from your IP address" });
        }

        const existing = await findNetworkBySubnet(subnet);
        if (existing) {
            const admin = await User.findById(existing.registeredBy).select("username");
            return res.status(409).json({
                message: admin?.username
                    ? `This network is already registered. ${admin.username} is the network admin — ask them if settings need to change.`
                    : "This network is already registered. Only the original network admin can change settings.",
                code: "NETWORK_ALREADY_REGISTERED",
            });
        }

        if (req.trustedNetworkConfig) {
            return res.status(400).json({
                message: "You are already on a registered network.",
            });
        }

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
            message:
                "You registered this network and are its admin. Others on this Wi-Fi can see shared files here; only you can change network settings.",
            config: {
                label: config.label,
                subnet: config.subnet,
                gatewayIp: config.gatewayIp || null,
                registeredFromIp: maskClientIp(config.registeredFromIp),
                registeredAt: config.registeredAt,
            },
            isNetworkAdmin: true,
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({
                message: "This network subnet is already registered.",
                code: "NETWORK_ALREADY_REGISTERED",
            });
        }
        res.status(500).json({ message: "Could not register trusted network" });
    }
});

router.put("/admin/network", authMiddleware, requireNetworkAdmin, async (req, res) => {
    try {
        const config = req.trustedNetworkConfig;

        if (!config) {
            return res.status(404).json({
                message: "No network registered for your current connection. Register it first.",
            });
        }

        const { label, gatewayIp } = req.body || {};

        if (label != null) {
            config.label = String(label).trim() || config.label;
        }

        if (gatewayIp !== undefined) {
            config.gatewayIp = gatewayIp ? String(gatewayIp).trim() : undefined;
        }

        config.updatedAt = new Date();
        await config.save();

        res.status(200).json({
            message: "Network settings updated",
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

router.delete("/admin/network", authMiddleware, requireNetworkAdmin, async (req, res) => {
    try {
        const config = req.trustedNetworkConfig;

        if (!config) {
            return res.status(404).json({
                message: "No network registered for your current connection.",
            });
        }

        await TrustedNetwork.deleteOne({ _id: config._id });

        res.status(200).json({
            message:
                "Network registration removed. Local Only files on this subnet are blocked until someone registers again.",
        });
    } catch {
        res.status(500).json({ message: "Could not reset trusted network settings" });
    }
});

module.exports = router;
