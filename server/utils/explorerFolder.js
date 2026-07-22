const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

function getExplorerRoot() {
    if (process.env.HOMESHARE_EXPLORER_DIR) {
        return process.env.HOMESHARE_EXPLORER_DIR;
    }
    return path.join(os.homedir(), "HomeShare");
}

function getExplorerFilesDir() {
    return path.join(getExplorerRoot(), "Files");
}

function findLogoSource() {
    const candidates = [
        path.join(__dirname, "..", "assets", "home.png"),
        path.join(__dirname, "..", "..", "client", "public", "home.png"),
        path.join(process.cwd(), "assets", "home.png"),
        path.join(process.cwd(), "home.png"),
        // Fallbacks if home.png is missing from an older package
        path.join(__dirname, "..", "assets", "HomeShareLogo.png"),
        path.join(__dirname, "..", "..", "client", "public", "HomeShareLogo.png"),
    ];

    return candidates.find((p) => fs.existsSync(p)) || null;
}

function writeDesktopIni(folder, iconPath) {
    const iniPath = path.join(folder, "desktop.ini");
    const relativeIcon = path.relative(folder, iconPath) || path.basename(iconPath);
    const content = [
        "[.ShellClassInfo]",
        `IconResource=${relativeIcon},0`,
        "IconFile=" + relativeIcon,
        "IconIndex=0",
        "ConfirmFileOp=0",
        "InfoTip=HomeShare local files — synced with Local Network Mode",
        "",
    ].join("\r\n");

    try {
        if (fs.existsSync(iniPath)) {
            fs.chmodSync(iniPath, 0o666);
        }
        fs.writeFileSync(iniPath, content, "utf8");
    } catch {
        // ignore
    }

    if (process.platform === "win32") {
        spawnSync("attrib", ["+s", folder], { windowsHide: true });
        spawnSync("attrib", ["+h", "+s", iniPath], { windowsHide: true });
    }
}

function convertPngToIco(pngPath, icoPath) {
    if (process.platform !== "win32") {
        return false;
    }

    const script = `
Add-Type -AssemblyName System.Drawing
$png = '${pngPath.replace(/'/g, "''")}'
$ico = '${icoPath.replace(/'/g, "''")}'
try {
  $img = [System.Drawing.Image]::FromFile($png)
  $size = 256
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $size, $size)
  $g.Dispose()
  $iconHandle = $bmp.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
  $fs = [System.IO.File]::Create($ico)
  $icon.Save($fs)
  $fs.Close()
  $icon.Dispose()
  $bmp.Dispose()
  $img.Dispose()
  exit 0
} catch {
  exit 1
}
`;

    const result = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        { windowsHide: true, encoding: "utf8" }
    );

    return result.status === 0 && fs.existsSync(icoPath);
}

function pinToQuickAccess(folder) {
    if (process.platform !== "win32") {
        return;
    }

    const script = `
$folder = '${folder.replace(/'/g, "''")}'
$shell = New-Object -ComObject Shell.Application
$item = $shell.NameSpace($folder)
if ($item -ne $null) {
  try { $item.Self.InvokeVerb('pintohome') } catch {}
}
`;

    spawnSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        { windowsHide: true }
    );
}

function createDesktopShortcut(folder, iconPath) {
    if (process.platform !== "win32") {
        return;
    }

    const desktop = path.join(os.homedir(), "Desktop");
    const shortcutPath = path.join(desktop, "HomeShare.lnk");
    const icon = iconPath && fs.existsSync(iconPath) ? iconPath : folder;

    const script = `
$shortcutPath = '${shortcutPath.replace(/'/g, "''")}'
$target = '${folder.replace(/'/g, "''")}'
$icon = '${icon.replace(/'/g, "''")}'
$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($shortcutPath)
$s.TargetPath = $target
$s.WorkingDirectory = $target
$s.Description = 'HomeShare local files'
$s.IconLocation = "$icon,0"
$s.Save()
`;

    spawnSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        { windowsHide: true }
    );
}

function writeReadme(folder) {
    const readme = path.join(folder, "README.txt");
    fs.writeFileSync(
        readme,
        [
            "HomeShare",
            "=========",
            "",
            "Put files in the Files\\ folder to upload them to your local HomeShare server.",
            "Delete files here to remove them from your HomeShare library too.",
            "",
            "Other people on the same Wi-Fi can open this same folder:",
            "  1. Open File Explorer on their PC",
            "  2. Paste \\\\YOUR-LAN-IP\\HomeShare in the address bar",
            "  3. Map network drive if they want it to stay",
            "",
            "Deleting or uploading on the website also updates this folder.",
            "Keep the local HomeShare server running while you sync.",
            "",
            "Do not delete this HomeShare folder while the server is running.",
            "",
        ].join("\r\n"),
        "utf8"
    );
}

/**
 * Creates a branded HomeShare folder in the user profile (like a OneDrive-style
 * place in File Explorer), pins it to Quick Access, and adds a Desktop shortcut.
 */
function setupExplorerFolder() {
    const root = getExplorerRoot();
    const filesDir = getExplorerFilesDir();
    const assetsDir = path.join(root, ".homeshare");

    fs.mkdirSync(filesDir, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });

    const logoSource = findLogoSource();
    let iconPath = path.join(assetsDir, "Home.ico");

    if (logoSource) {
        const pngDest = path.join(assetsDir, "home.png");
        try {
            fs.copyFileSync(logoSource, pngDest);
        } catch {
            // ignore
        }

        if (
            !fs.existsSync(iconPath) ||
            fs.statSync(logoSource).mtimeMs > fs.statSync(iconPath).mtimeMs
        ) {
            const ok = convertPngToIco(pngDest, iconPath);
            if (!ok) {
                iconPath = pngDest;
            }
        }
    } else if (!fs.existsSync(iconPath)) {
        iconPath = null;
    }

    if (iconPath && fs.existsSync(iconPath)) {
        writeDesktopIni(root, iconPath);
    }

    writeReadme(root);
    pinToQuickAccess(root);
    createDesktopShortcut(root, iconPath && fs.existsSync(iconPath) ? iconPath : null);

    let folderShare = null;
    try {
        const { ensureFolderShare } = require("./folderShare");
        folderShare = ensureFolderShare(root);
    } catch (err) {
        console.warn(`[HomeShare] Folder share setup skipped: ${err.message}`);
    }

    return { root, filesDir, folderShare };
}

module.exports = {
    getExplorerRoot,
    getExplorerFilesDir,
    setupExplorerFolder,
};
