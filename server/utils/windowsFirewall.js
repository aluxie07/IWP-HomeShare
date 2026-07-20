const { spawnSync } = require("child_process");

const RULE_NAME = "HomeShare Local API";

function ensureWindowsFirewallRule(port) {
    if (process.platform !== "win32") {
        return { ok: true, skipped: true };
    }

    const check = spawnSync(
        "netsh",
        ["advfirewall", "firewall", "show", "rule", `name=${RULE_NAME}`],
        { windowsHide: true, encoding: "utf8" }
    );

    if (check.status === 0 && String(check.stdout || "").includes(RULE_NAME)) {
        return { ok: true, alreadyExists: true };
    }

    const add = spawnSync(
        "netsh",
        [
            "advfirewall",
            "firewall",
            "add",
            "rule",
            `name=${RULE_NAME}`,
            "dir=in",
            "action=allow",
            "protocol=TCP",
            `localport=${port}`,
        ],
        { windowsHide: true, encoding: "utf8" }
    );

    if (add.status === 0) {
        return { ok: true, created: true };
    }

    return {
        ok: false,
        message:
            `Could not open Windows Firewall port ${port}. ` +
            "Run Start HomeShare.bat as Administrator once, or allow Node.js when Windows prompts.",
    };
}

module.exports = {
    RULE_NAME,
    ensureWindowsFirewallRule,
};
