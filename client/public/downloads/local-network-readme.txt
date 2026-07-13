HomeShare Local for Windows
==========================

Download: HomeShare-Local-Windows.zip (from this website after deploy, or build locally — see below)

QUICK START
-----------
1. Download and unzip HomeShare-Local-Windows.zip
2. Double-click Start HomeShare.bat
3. First run: Notepad opens — set MONGO_URI (MongoDB Atlas), save, close
4. Run Start HomeShare.bat again — keep the window open
5. Open https://aluxie07.github.io/IWP-HomeShare (or your local client)
6. Enable Local Network Mode → Detect local server

BUILD THE ZIP (developers / local website)
------------------------------------------
From the repo root on Windows:

  cd server
  npm run build:local-package

This creates:
  client/public/downloads/HomeShare-Local-Windows.zip

Then restart the React dev server (npm start) and download will work.

GITHUB PAGES
------------
The zip is built automatically when you push to main (Deploy workflow).
If the download link 404s, merge your branch and wait for the GitHub Action to finish.

CONFIG LOCATION
---------------
%APPDATA%\HomeShare\local-server\.env
%APPDATA%\HomeShare\local-server\uploads\
