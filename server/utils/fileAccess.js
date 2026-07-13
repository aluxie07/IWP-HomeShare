const ACCESS_MODES = ["private", "shared", "local_only"];

function normalizeAccessMode(mode) {
    const value = String(mode || "private").trim().toLowerCase();
    return ACCESS_MODES.includes(value) ? value : "private";
}

function requiresTrustedNetwork(file) {
    return normalizeAccessMode(file.accessMode) === "local_only";
}

function allowsShareLinks(file) {
    return normalizeAccessMode(file.accessMode) !== "private";
}

function getNetworkDenialMessage(file, { configured }) {
    if (!configured) {
        return "Trusted network is not configured yet. An administrator must register the network before Local Only files can be accessed.";
    }
    return "This file is Local Only. Connect to the trusted network (same Wi-Fi / LAN) to access it.";
}

function assertFileNetworkAccess(file, { isTrustedNetwork, configured }) {
    if (!requiresTrustedNetwork(file)) {
        return { ok: true };
    }

    if (!configured || !isTrustedNetwork) {
        return {
            ok: false,
            status: 403,
            code: "LOCAL_NETWORK_REQUIRED",
            message: getNetworkDenialMessage(file, { configured }),
        };
    }

    return { ok: true };
}

module.exports = {
    ACCESS_MODES,
    normalizeAccessMode,
    requiresTrustedNetwork,
    allowsShareLinks,
    getNetworkDenialMessage,
    assertFileNetworkAccess,
};
