const os = require("os");

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

function isLocalDiskServer() {
    return (process.env.FILE_STORAGE || "").trim().toLowerCase() === "disk";
}

function isLoopbackIpv4(ip) {
    return isIpv4(ip) && (ip === "127.0.0.1" || ip.startsWith("127."));
}

/** Prefer a real LAN IPv4 when the browser hits the local server via 127.0.0.1 */
function getPreferredLanIpv4() {
    const nets = os.networkInterfaces();
    const candidates = [];

    for (const entries of Object.values(nets)) {
        for (const entry of entries || []) {
            if (entry.family !== "IPv4" && entry.family !== 4) {
                continue;
            }
            if (entry.internal) {
                continue;
            }
            const ip = normalizeIp(entry.address);
            if (isPrivateIpv4(ip) && !isLoopbackIpv4(ip)) {
                candidates.push(ip);
            }
        }
    }

    // Prefer common home/office ranges
    candidates.sort((a, b) => {
        const score = (ip) => {
            if (ip.startsWith("192.168.")) return 0;
            if (ip.startsWith("10.")) return 1;
            return 2;
        };
        return score(a) - score(b);
    });

    return candidates[0] || "";
}

function isPrivateLanCidr(cidr) {
    const [ipPart] = String(cidr || "").split("/");
    if (!isIpv4(ipPart)) {
        return false;
    }
    if (ipPart.startsWith("127.")) {
        return false;
    }
    return isPrivateIpv4(ipPart);
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

/**
 * Bind a Local Only file to the uploader's IP range (/24 on LAN, /32 on public).
 */
function buildLocalOnlyBinding(clientIp) {
    let ip = normalizeIp(clientIp);

    if (isLoopbackIpv4(ip) && isLocalDiskServer()) {
        const lan = getPreferredLanIpv4();
        if (lan) {
            ip = lan;
        }
    }

    if (!isIpv4(ip)) {
        return null;
    }

    if (isLoopbackIpv4(ip)) {
        return {
            uploadClientIp: ip,
            localOnlyCidr: "127.0.0.0/8",
        };
    }

    if (isPrivateIpv4(ip)) {
        return {
            uploadClientIp: ip,
            localOnlyCidr: subnetFromIp(ip, 24),
        };
    }

    // Public / cloud IP — exact host only
    return {
        uploadClientIp: ip,
        localOnlyCidr: `${ip}/32`,
    };
}

/**
 * True if requester may access a Local Only file bound to localOnlyCidr.
 */
function clientMatchesLocalOnlyCidr(clientIp, localOnlyCidr) {
    const cidr = String(localOnlyCidr || "").trim();
    if (!cidr) {
        return false;
    }

    const ip = normalizeIp(clientIp);
    if (isIpInCidr(ip, cidr)) {
        return true;
    }

    // Local server host via 127.0.0.1 can still open files bound to their LAN
    if (isLocalDiskServer() && isLoopbackIpv4(ip) && isPrivateLanCidr(cidr)) {
        return true;
    }

    return false;
}

module.exports = {
    getClientIp,
    isIpv4,
    isIpInCidr,
    isPrivateIpv4,
    isPrivateLanCidr,
    isLocalDiskServer,
    isLoopbackIpv4,
    getPreferredLanIpv4,
    subnetFromIp,
    maskClientIp,
    buildLocalOnlyBinding,
    clientMatchesLocalOnlyCidr,
};
