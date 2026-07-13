# Portable Windows package — Node + server bundled. No install required for end users.
# Output: dist/local/HomeShare-Local-Windows.zip

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Server = Join-Path $Root "server"
$PkgDir = Join-Path $Root "dist\local\HomeShare-Local"
$ZipPath = Join-Path $Root "dist\local\HomeShare-Local-Windows.zip"
$NodeVersion = "20.18.1"
$NodeZip = "node-v$NodeVersion-win-x64.zip"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeZip"

Write-Host "Building HomeShare Local Windows package..."

if (Test-Path $PkgDir) { Remove-Item $PkgDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $PkgDir | Out-Null

$CacheDir = Join-Path $Root "dist\cache"
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
$NodeZipPath = Join-Path $CacheDir $NodeZip

if (-not (Test-Path $NodeZipPath)) {
    Write-Host "Downloading portable Node.js v$NodeVersion..."
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZipPath
}

$NodeExtract = Join-Path $CacheDir "node-v$NodeVersion-win-x64"
if (-not (Test-Path (Join-Path $NodeExtract "node.exe"))) {
    Expand-Archive -Path $NodeZipPath -DestinationPath $CacheDir -Force
}

# Portable Node runtime (includes npm for first-run repair)
Copy-Item (Join-Path $NodeExtract "node.exe") (Join-Path $PkgDir "node.exe")
Copy-Item (Join-Path $NodeExtract "npm.cmd") (Join-Path $PkgDir "npm.cmd")
Copy-Item (Join-Path $NodeExtract "npx.cmd") (Join-Path $PkgDir "npx.cmd")
Copy-Item (Join-Path $NodeExtract "node_modules") (Join-Path $PkgDir "node_modules") -Recurse -Force

# Server source (no node_modules — installed fresh below)
$Exclude = @("uploads", "scripts", "dist", "cache", ".env", "node_modules")
Get-ChildItem $Server | Where-Object { $Exclude -notcontains $_.Name } | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $PkgDir $_.Name) -Recurse -Force
}

Write-Host "Installing production dependencies into package..."
Push-Location $PkgDir
& .\npm.cmd install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "npm install failed inside package directory"
}
if (-not (Test-Path "node_modules\dotenv\package.json")) {
    Pop-Location
    throw "Build verification failed: dotenv not installed in package"
}
Pop-Location

$Launcher = @'
@echo off
title HomeShare Local Server
cd /d "%~dp0"
echo.
echo  HomeShare Local Server
echo  ======================
echo.

if not exist "node_modules\dotenv" (
    echo  Installing dependencies first time only...
    call npm.cmd install --omit=dev --no-audit --no-fund
    if errorlevel 1 (
        echo  Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo  Starting... Keep this window open.
echo.
node.exe local-entry.js
echo.
pause
'@
Set-Content -Path (Join-Path $PkgDir "Start HomeShare.bat") -Value $Launcher -Encoding ASCII

$Readme = @"
HomeShare Local for Windows
=============================

1. Unzip this folder anywhere (e.g. Desktop\HomeShare-Local)
2. Double-click "Start HomeShare.bat"
3. First run opens Notepad — set your MONGO_URI (MongoDB Atlas), save, close
4. Double-click "Start HomeShare.bat" again
5. Open https://aluxie07.github.io/IWP-HomeShare
6. Enable Local Network Mode → Detect local server

Config: %APPDATA%\HomeShare\local-server\.env
"@
Set-Content -Path (Join-Path $PkgDir "README.txt") -Value $Readme -Encoding UTF8

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

Write-Host "Creating zip with tar (supports long node_modules paths)..."
$ZipParent = Split-Path $PkgDir -Parent
$ZipName = Split-Path $PkgDir -Leaf
Push-Location $ZipParent
tar -a -cf $ZipPath $ZipName
Pop-Location

if (-not (Test-Path $ZipPath)) {
    throw "Failed to create zip at $ZipPath"
}

$DownloadsDir = Join-Path $Root "client\public\downloads"
New-Item -ItemType Directory -Force -Path $DownloadsDir | Out-Null
Copy-Item $ZipPath (Join-Path $DownloadsDir "HomeShare-Local-Windows.zip") -Force

Write-Host "Package ready:"
Write-Host "  $ZipPath"
Write-Host "  $DownloadsDir\HomeShare-Local-Windows.zip"
