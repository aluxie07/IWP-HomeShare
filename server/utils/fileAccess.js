const {
    clientMatchesLocalOnlyCidr,
} = require("./networkTrust");

const ACCESS_MODES = ["private", "shared", "local_only"];

function normalizeAccessMode(mode) {
    const value = String(mode || "private").trim().toLowerCase();
    return ACCESS_MODES.includes(value) ? value : "private";
}

function requiresLocalOnlyIp(file) {
    return normalizeAccessMode(file.accessMode) === "local_only";
}

function allowsShareLinks(file) {
    return normalizeAccessMode(file.accessMode) !== "private";
}

function getLocalOnlyDenialMessage(file) {
    if (!file?.localOnlyCidr) {
        return "This Local Only file has no saved upload network. Change its access mode to Local Only again while on the intended Wi‑Fi.";
    }
    return "This file is Local Only. Connect from the same local network (IP range) as the uploader to download it.";
}

/**
 * Owner always passes. Local Only requires requester IP in the file's CIDR.
 */
function assertFileNetworkAccess(file, { clientIp, isOwner = false } = {}) {
    if (!requiresLocalOnlyIp(file)) {
        return { ok: true };
    }

    if (isOwner) {
        return { ok: true };
    }

    if (!clientMatchesLocalOnlyCidr(clientIp, file.localOnlyCidr)) {
        return {
            ok: false,
            status: 403,
            code: "LOCAL_NETWORK_REQUIRED",
            message: getLocalOnlyDenialMessage(file),
        };
    }

    return { ok: true };
}

/** @deprecated use requiresLocalOnlyIp */
function requiresTrustedNetwork(file) {
    return requiresLocalOnlyIp(file);
}

module.exports = {
    ACCESS_MODES,
    normalizeAccessMode,
    requiresLocalOnlyIp,
    requiresTrustedNetwork,
    allowsShareLinks,
    getLocalOnlyDenialMessage,
    getNetworkDenialMessage: getLocalOnlyDenialMessage,
    assertFileNetworkAccess,
};
