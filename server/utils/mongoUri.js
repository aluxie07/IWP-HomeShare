/**
 * Helpers for MongoDB Atlas connection strings in .env files.
 * Passwords with # @ / : % must be URL-encoded in the URI and quoted in .env.
 */

function normalizeMongoUri(raw) {
    if (raw == null) {
        return "";
    }

    let uri = String(raw).trim();

    if ((uri.startsWith('"') && uri.endsWith('"')) || (uri.startsWith("'") && uri.endsWith("'"))) {
        uri = uri.slice(1, -1).trim();
    }

    uri = uri.replace(/^<(.+)>$/s, "$1").trim();

    return uri;
}

function quoteEnvValue(value) {
    const s = String(value).replace(/\r?\n/g, "");
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function readMongoUriFromEnvContents(contents) {
    const match = String(contents || "").match(/^MONGO_URI=(.*)$/m);
    if (!match) {
        return "";
    }
    return normalizeMongoUri(match[1]);
}

function describeMongoUri(rawUri) {
    const uri = normalizeMongoUri(rawUri);
    const info = {
        uri,
        valid: false,
        user: null,
        host: null,
        database: null,
        looksTruncated: false,
        hasUnquotedEnvHazard: false,
        warnings: [],
    };

    if (!uri) {
        info.warnings.push("MONGO_URI is empty.");
        return info;
    }

    if (uri.includes("USER:PASSWORD")) {
        info.warnings.push("MONGO_URI still contains the Atlas placeholder — paste your real connection string.");
        return info;
    }

    // Unquoted .env treats # as a comment — common cause of "correct URI" that still fails
    if (rawUri && String(rawUri).includes("#")) {
        info.hasUnquotedEnvHazard = true;
        info.warnings.push(
            "URI contains '#'. In .env it must be inside double quotes or the password must be URL-encoded."
        );
    }

    const parsed = uri.match(/^mongodb(\+srv)?:\/\/([^/]+)(?:\/([^?]+))?/);
    if (!parsed) {
        info.looksTruncated = true;
        info.warnings.push("URI does not look like mongodb:// or mongodb+srv:// — it may be truncated.");
        return info;
    }

    const authority = parsed[2];
    const at = authority.lastIndexOf("@");
    if (at === -1) {
        info.looksTruncated = true;
        info.warnings.push("URI is missing '@cluster...' — often caused by '#' in an unquoted .env line.");
        return info;
    }

    const userinfo = authority.slice(0, at);
    info.host = authority.slice(at + 1);
    info.database = parsed[3] || null;
    info.user = userinfo.split(":")[0] || null;
    info.valid = Boolean(info.host);

    const colon = userinfo.indexOf(":");
    if (colon !== -1) {
        const password = userinfo.slice(colon + 1);
        if (/[#/\s@]/.test(decodeURIComponent(password))) {
            info.warnings.push(
                "Password may need URL-encoding in the URI (special chars like # @ / space)."
            );
        }
    }

    return info;
}

function maskMongoUri(rawUri) {
    const info = describeMongoUri(rawUri);
    if (!info.valid) {
        return "(invalid or incomplete URI)";
    }
    const db = info.database ? `/${info.database}` : "";
    return `mongodb+srv://${info.user || "?"}:***@${info.host}${db}`;
}

async function logAtlasNetworkHints() {
    console.error(
        "  Atlas Network Access needs your PUBLIC internet IP — not 192.168.x.x from your Wi‑Fi."
    );
    try {
        const https = require("https");
        const ip = await new Promise((resolve, reject) => {
            const req = https.get(
                "https://api.ipify.org?format=json",
                { timeout: 5000 },
                (res) => {
                    let body = "";
                    res.on("data", (chunk) => {
                        body += chunk;
                    });
                    res.on("end", () => {
                        try {
                            resolve(JSON.parse(body).ip);
                        } catch (err) {
                            reject(err);
                        }
                    });
                }
            );
            req.on("error", reject);
            req.on("timeout", () => {
                req.destroy();
                reject(new Error("timeout"));
            });
        });
        if (ip) {
            console.error(`  Your current public IP appears to be ${ip} — add /32 in Atlas if you restrict by IP.`);
        }
    } catch {
        console.error("  Look up your public IP (e.g. https://ifconfig.me) and add it in Atlas → Network Access.");
    }
    console.error("  To rule out IP issues temporarily, allow 0.0.0.0/0 (dev only), wait 1–2 minutes, then retry.");
}

module.exports = {
    normalizeMongoUri,
    quoteEnvValue,
    readMongoUriFromEnvContents,
    describeMongoUri,
    maskMongoUri,
    logAtlasNetworkHints,
};
