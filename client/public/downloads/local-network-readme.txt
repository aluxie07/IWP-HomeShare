HomeShare Local for Windows
==========================

Download: HomeShare-Local-Windows.zip (from Local Network Mode on the website)

QUICK START
-----------
1. Download and unzip HomeShare-Local-Windows.zip
2. Double-click Start HomeShare.bat
3. First run: setup window opens — paste your MongoDB Atlas URI, click Save and start
4. Keep the window open
5. Open the HomeShare website → Local Network Mode → Detect local server

Config is saved to: %APPDATA%\HomeShare\local-server\.env
(not inside the unzipped folder)

BUILD THE ZIP (maintainers)
---------------------------
On Windows:

  cd server
  npm ci
  npm run build:local-package

Output: client/public/downloads/HomeShare-Local-Windows.zip
