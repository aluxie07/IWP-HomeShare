const os = require("os");
const { spawnSync } = require("child_process");
const { getExplorerRoot } = require("./explorerFolder");

const SHARE_NAME = "HomeShare";

function listLanIpv4() {
    const nets = os.networkInterfaces();
    const scored = [];

    for (const [ifaceName, entries] of Object.entries(nets)) {
        for (const net of entries || []) {
            const family = net.family === "IPv4" || net.family === 4;
            if (!family || net.internal) {
                continue;
            }
            const ip = net.address;
            if (
                !(
                    ip.startsWith("10.") ||
                    ip.startsWith("192.168.") ||
                    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
                )
            ) {
                continue;
            }

            let score = 100;
            const name = String(ifaceName || "").toLowerCase();
            // Prefer real Wi-Fi / Ethernet over VM / VPN adapters
            if (/wi-?fi|wlan|wireless/.test(name)) {
                score += 40;
            } else if (/ethernet|eth\d|lan/.test(name)) {
                score += 30;
            }
            if (
                /virtual|vbox|vmware|hyper-v|vethernet|loopback|docker|wsl|vpn|tun|tap|bluetooth/.test(
                    name
                )
            ) {
                score -= 80;
            }
            // Common VirtualBox Host-Only default range
            if (ip.startsWith("192.168.56.")) {
                score -= 70;
            }
            // Hyper-V / Default Switch often 172.17–172.31 on virtual adapters already penalized

            scored.push({ ip, score });
        }
    }

    scored.sort((a, b) => b.score - a.score || a.ip.localeCompare(b.ip));
    return [...new Set(scored.map((item) => item.ip))];
}

function runPowerShell(script) {
    return spawnSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        { windowsHide: true, encoding: "utf8" }
    );
}

/**
 * Create/update a LAN SMB share so other PCs can map \\IP\HomeShare
 * to the same Explorer folder the host uses.
 */
function ensureFolderShare(folderPath = getExplorerRoot()) {
    if (process.platform !== "win32") {
        return {
            enabled: false,
            shareName: SHARE_NAME,
            folderPath,
            uncPaths: [],
            lanIps: listLanIpv4(),
            message: "Folder sharing is only automated on Windows.",
        };
    }

    if (process.env.HOMESHARE_FOLDER_SHARE === "false") {
        return {
            enabled: false,
            shareName: SHARE_NAME,
            folderPath,
            uncPaths: [],
            lanIps: listLanIpv4(),
            message: "Folder sharing disabled (HOMESHARE_FOLDER_SHARE=false).",
        };
    }

    const safePath = folderPath.replace(/'/g, "''");
    const script = `
$ErrorActionPreference = 'Stop'
$path = '${safePath}'
$name = '${SHARE_NAME}'

# Prefer private/LAN profile firewall rules for File and Printer Sharing
try {
  Enable-NetFirewallRule -DisplayGroup "File and Printer Sharing" -ErrorAction SilentlyContinue | Out-Null
} catch {}

$existing = Get-SmbShare -Name $name -ErrorAction SilentlyContinue
if ($null -eq $existing) {
  New-SmbShare -Name $name -Path $path -Description "HomeShare local files" -FullAccess "Everyone" | Out-Null
} elseif ($existing.Path -ne $path) {
  Remove-SmbShare -Name $name -Force
  New-SmbShare -Name $name -Path $path -Description "HomeShare local files" -FullAccess "Everyone" | Out-Null
}

# Ensure Everyone can change files in the share
try {
  Grant-SmbShareAccess -Name $name -AccountName "Everyone" -AccessRight Full -Force | Out-Null
} catch {}

Get-SmbShare -Name $name | Select-Object -ExpandProperty Name
`;

    const result = runPowerShell(script);
    const lanIps = listLanIpv4();
    const uncPaths = lanIps.map((ip) => `\\\\${ip}\\${SHARE_NAME}`);

    if (result.status !== 0) {
        const errText = `${result.stderr || ""} ${result.stdout || ""}`.trim();
        console.warn(
            `[HomeShare] Could not auto-create SMB share (may need admin once): ${errText.slice(0, 300)}`
        );
        return {
            enabled: false,
            shareName: SHARE_NAME,
            folderPath,
            uncPaths,
            lanIps,
            message:
                "Could not create the Windows share automatically. Run the local server as Administrator once, or share the HomeShare folder manually.",
            error: errText.slice(0, 500),
        };
    }

    console.log(
        `[HomeShare] Folder shared on LAN as \\\\${lanIps[0] || "YOUR-IP"}\\${SHARE_NAME}`
    );

    return {
        enabled: true,
        shareName: SHARE_NAME,
        folderPath,
        uncPaths,
        preferredUnc: uncPaths[0] || `\\\\${os.hostname()}\\${SHARE_NAME}`,
        lanIps,
        apiUrls: lanIps.map((ip) => `http://${ip}:${process.env.PORT || 8080}`),
        message: "Other PCs on this Wi-Fi can map this folder in File Explorer.",
    };
}

function getFolderShareInfo() {
    const folderPath = getExplorerRoot();
    const lanIps = listLanIpv4();
    const uncPaths = lanIps.map((ip) => `\\\\${ip}\\${SHARE_NAME}`);

    let enabled = false;
    if (process.platform === "win32") {
        const check = runPowerShell(
            `if (Get-SmbShare -Name '${SHARE_NAME}' -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }`
        );
        enabled = (check.stdout || "").includes("yes");
    }

    return {
        enabled,
        shareName: SHARE_NAME,
        folderPath,
        uncPaths,
        preferredUnc: uncPaths[0] || null,
        lanIps,
        apiUrls: lanIps.map((ip) => `http://${ip}:${process.env.PORT || 8080}`),
        hostname: os.hostname(),
        joinSteps: [
            "On another PC on the same Wi-Fi, open File Explorer.",
            `In the address bar paste: ${uncPaths[0] || `\\\\HOST-IP\\${SHARE_NAME}`}`,
            "Press Enter. If Windows asks to sign in, use the host PC Windows account (or try guest/Everyone if enabled).",
            "Optional: right-click → Map network drive so it stays as a drive letter.",
            `Also connect the website to: ${lanIps[0] ? `http://${lanIps[0]}:${process.env.PORT || 8080}` : "http://HOST-IP:8080"}`,
        ],
    };
}

module.exports = {
    SHARE_NAME,
    listLanIpv4,
    ensureFolderShare,
    getFolderShareInfo,
};
