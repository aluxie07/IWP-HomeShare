@echo off
title HomeShare Local Server
echo.
echo  HomeShare Local Network Mode
echo  ============================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo  Node.js is required. Install from https://nodejs.org
    echo  Then run this file again.
    pause
    exit /b 1
)

set "INSTALL_DIR=%USERPROFILE%\HomeShare-Local"
set "REPO_URL=https://github.com/YOUR_USERNAME/IWP-HomeShare.git"

if not exist "%INSTALL_DIR%\server\index.js" (
    echo  First-time setup: downloading HomeShare server...
    if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
    where git >nul 2>nul
    if errorlevel 1 (
        echo.
        echo  Git is not installed. Either:
        echo    1. Install Git from https://git-scm.com
        echo    2. Or download the repo ZIP from GitHub and extract to:
        echo       %INSTALL_DIR%
        echo    3. Then run this script again.
        pause
        exit /b 1
    )
    git clone "%REPO_URL%" "%INSTALL_DIR%" 2>nul
    if not exist "%INSTALL_DIR%\server\index.js" (
        echo.
        echo  Clone failed. Edit REPO_URL in this .bat file to your GitHub repo,
        echo  or place the project in %INSTALL_DIR% manually.
        pause
        exit /b 1
    )
)

cd /d "%INSTALL_DIR%\server"

if not exist ".env" (
    echo  Creating server\.env for local + GitHub Pages...
    (
        echo FILE_STORAGE=disk
        echo PORT=8080
        echo JWT_SECRET=local-dev-change-this-secret
        echo MONGO_URI=mongodb://127.0.0.1:27017/homeshare
        echo CLIENT_URL=https://YOUR_USERNAME.github.io/IWP-HomeShare
        echo ALLOWED_ORIGINS=https://YOUR_USERNAME.github.io,http://localhost:3000,http://127.0.0.1:3000
        echo.
        echo  Replace YOUR_USERNAME and MONGO_URI before production use.
    ) > .env
    echo.
    echo  IMPORTANT: Edit %INSTALL_DIR%\server\.env
    echo  - Set MONGO_URI ^(MongoDB Atlas or local MongoDB^)
    echo  - Set CLIENT_URL to your GitHub Pages URL
    echo  - Set ALLOWED_ORIGINS to match your Pages URL
    echo.
)

if not exist "node_modules" (
    echo  Installing dependencies...
    call npm install
)

echo.
echo  Starting local server on http://127.0.0.1:8080
echo  Keep this window open.
echo  Then open your HomeShare website and click "Detect local server".
echo.
set FILE_STORAGE=disk
node index.js
pause
