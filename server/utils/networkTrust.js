const TrustedNetwork = require("../models/TrustedNetwork");

function normalizeIp(raw) {
    if (!raw) {
        return "";
    }

    let ip = String(raw).trim();

    if (ip.startsWith("::ffff:")) {
        ip = ip.slice(7);
    }

    if (ip.includes("%")) {
        ip = ip.split("%")[0];
    }

    return ip;
}

function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
        const first = String(forwarded).split(",")[0].trim();
        if (first) {
            return normalizeIp(first);
        }
    }

    if (req.headers["x-real-ip"]) {
        return normalizeIp(req.headers["x-real-ip"]);
    }

    return normalizeIp(req.socket?.remoteAddress || req.ip || "");
}

function ipToLong(ip) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
        return null;
    }

    return (
        ((parts[0] << 24) >>> 0) +
        ((parts[1] << 16) >>> 0) +
        ((parts[2] << 8) >>> 0) +
        (parts[3] >>> 0)
    );
}

function parseCidr(cidr) {
    const [ipPart, prefixPart] = String(cidr).split("/");
    const prefix = prefixPart != null ? Number(prefixPart) : 32;
    const base = ipToLong(ipPart);

    if (base == null || Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
        return null;
    }

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return { base: base & mask, mask };
}

function isIpv4(ip) {
    return ipToLong(ip) != null;
}

function isIpInCidr(ip, cidr) {
    const parsed = parseCidr(cidr);
    const value = ipToLong(ip);

    if (!parsed || value == null) {
        return false;
    }

    return (value & parsed.mask) === parsed.base;
}

function isPrivateIpv4(ip) {
    const long = ipToLong(ip);
    if (long == null) {
        return false;
    }

    const ranges = [
        ["10.0.0.0", "10.255.255.255"],
        ["172.16.0.0", "172.31.255.255"],
        ["192.168.0.0", "192.168.255.255"],
        ["127.0.0.0", "127.255.255.255"],
    ];

    return ranges.some(([start, end]) => {
        const s = ipToLong(start);
        const e = ipToLong(end);
        return long >= s && long <= e;
    });
}

function subnetFromIp(ip, prefix = 24) {
    const long = ipToLong(ip);
    if (long == null) {
        return null;
    }

    const mask = (~0 << (32 - prefix)) >>> 0;
    const base = long & mask;
    const octets = [
        (base >>> 24) & 255,
        (base >>> 16) & 255,
        (base >>> 8) & 255,
        base & 255,
    ];

    return `${octets.join(".")}/${prefix}`;
}

function maskClientIp(ip) {
    if (!isIpv4(ip)) {
        return ip || "unknown";
    }

    const parts = ip.split(".");
    parts[3] = "xxx";
    return parts.join(".");
}

async function findNetworkForIp(ip) {
    if (!isIpv4(ip)) {
        return null;
    }

    const networks = await TrustedNetwork.find({}).sort({ updatedAt: -1 });
    for (const config of networks) {
        if (isIpInCidr(ip, config.subnet)) {
            return config;
        }
        if (config.registeredFromIp && ip === config.registeredFromIp) {
            return config;
        }
    }
    return null;
}

async function findNetworkBySubnet(subnet) {
    const normalized = String(subnet || "").trim();
    if (!normalized) {
        return null;
    }
    return TrustedNetwork.findOne({ subnet: normalized });
}

async function isIpOnTrustedNetwork(ip) {
    const config = await findNetworkForIp(ip);
    if (config) {
        return { trusted: true, configured: true, config };
    }

    const anyConfigured = (await TrustedNetwork.countDocuments({})) > 0;
    return { trusted: false, configured: anyConfigured, config: null };
}

function getAccessLevel({ configured, trusted }) {
    if (!trusted) {
        return configured ? "restricted" : "unconfigured";
    }
    return "trusted";
}

function isNetworkAdmin(config, userId) {
    if (!config || !userId) {
        return false;
    }
    return String(config.registeredBy) === String(userId);
}

module.exports = {
    getClientIp,
    isIpv4,
    isIpInCidr,
    isPrivateIpv4,
    subnetFromIp,
    maskClientIp,
    findNetworkForIp,
    findNetworkBySubnet,
    isIpOnTrustedNetwork,
    getAccessLevel,
    isNetworkAdmin,
};
