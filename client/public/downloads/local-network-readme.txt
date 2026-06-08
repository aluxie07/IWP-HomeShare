HomeShare — Local Network Mode (from GitHub Pages)
==================================================

The website on GitHub Pages is only the frontend. Local Network Mode needs
a small server running on your PC or on your Wi-Fi network.

QUICK START (same computer as the website)
------------------------------------------
1. Install Node.js: https://nodejs.org
2. Download and run:
   - Windows: start-homeshare-local.bat
   - Mac/Linux: start-homeshare-local.sh (chmod +x first)
3. Edit ~/HomeShare-Local/server/.env when prompted:
   - MONGO_URI = your MongoDB connection string
   - CLIENT_URL = your GitHub Pages URL
     e.g. https://YOUR_USERNAME.github.io/IWP-HomeShare
   - ALLOWED_ORIGINS = same URL + http://localhost:3000
4. Keep the server window open.
5. Open your GitHub Pages site in the browser.
6. Click "Enable local mode" → "Detect local server".

The site will automatically switch from Render to your local server.

OTHER DEVICES ON THE SAME WI-FI (phone, tablet)
-------------------------------------------------
1. Run the server on one PC (steps above).
2. On that PC, find its LAN IP (e.g. 192.168.1.100).
3. On each device, open the GitHub Pages site.
4. Enable local mode → enter: http://192.168.1.100:8080
5. Log in and use Local Only files as usual.

ADMIN: REGISTER TRUSTED NETWORK
-------------------------------
After local mode is connected, log in as admin → Network →
"Register current network".

TROUBLESHOOTING
---------------
- "Cannot reach API" → server not running or wrong address
- CORS error → fix ALLOWED_ORIGINS in server/.env to match your Pages URL
- MongoDB error → set MONGO_URI in server/.env (Atlas or local MongoDB)

Replace YOUR_USERNAME in the starter scripts with your real GitHub username
before sharing the download links.
