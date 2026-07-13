@echo off
title HomeShare Local Server
echo.
echo  HomeShare Local Network Mode
echo  ============================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo  Node.js is required. Install from https://nodejs.org
    echo  Or use HomeShare-Local-Windows.zip instead (no install needed).
    pause
    exit /b 1
)

set "INSTALL_DIR=%USERPROFILE%\HomeShare-Local"
set "REPO_URL=https://github.com/aluxie07/IWP-HomeShare.git"

if not exist "%INSTALL_DIR%\server\index.js" (
    echo  First-time setup: downloading HomeShare server...
    if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
    where git >nul 2>nul
    if errorlevel 1 (
        echo  Git is not installed. Use HomeShare-Local-Windows.zip from the website instead.
        pause
        exit /b 1
    )
    git clone "%REPO_URL%" "%INSTALL_DIR%"
)

cd /d "%INSTALL_DIR%\server"

if not exist ".env" (
    echo FILE_STORAGE=disk> .env
    echo PORT=8080>> .env
    echo CLIENT_URL=https://aluxie07.github.io/IWP-HomeShare>> .env
    echo ALLOWED_ORIGINS=https://aluxie07.github.io/IWP-HomeShare,http://localhost:3000,http://127.0.0.1:3000>> .env
    echo JWT_SECRET=change-this-to-a-long-random-string>> .env
    echo MONGO_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/homeshare>> .env
    echo.
    echo  Edit .env and set MONGO_URI, then run this script again.
    notepad .env
    pause
    exit /b 0
)

if not exist "node_modules" (
    call npm install --omit=dev
)

echo  Starting http://127.0.0.1:8080 ...
set FILE_STORAGE=disk
node local-entry.js
pause
