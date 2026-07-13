# Deploying HomeShare

GitHub Pages hosts **only the React frontend** (static files). Your **Express API** and **MongoDB Atlas** must run elsewhere.

## 1. Push code to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/IWP-HomeShare.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

## 2. Enable GitHub Pages

1. Open the repo on GitHub → **Settings** → **Pages**
2. Under **Build and deployment** → **Source**, choose **GitHub Actions**
3. After the workflow runs, your site will be at:

   `https://YOUR_USERNAME.github.io/IWP-HomeShare/`

## 3. Add GitHub secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret | Example | Required |
|--------|---------|----------|
| `REACT_APP_API_URL` | `https://your-api.onrender.com` | Yes (after backend is deployed) |
| `REACT_APP_RECAPTCHA_SITE_KEY` | your site key | Yes |

Re-run the deploy workflow after adding secrets: **Actions** → **Deploy client to GitHub Pages** → **Run workflow**.

## 4. Deploy the backend (required for login/register)

GitHub Pages cannot run Node.js or MongoDB. Use a free host such as [Render](https://render.com):

1. New **Web Service** → connect your repo
2. **Root directory:** `server`
3. **Build command:** `npm install`
4. **Start command:** `node index.js`
5. Add environment variables from `server/.env` (never commit `.env`)
6. Set `CLIENT_URL` to your GitHub Pages URL, e.g. `https://YOUR_USERNAME.github.io/IWP-HomeShare`
7. Copy the Render URL into GitHub secret `REACT_APP_API_URL`

### MongoDB Atlas for production

- **Network Access:** add `0.0.0.0/0` (Render uses dynamic IPs) or Render’s static outbound IP if on a paid plan
- Use the same `MONGO_URI` as local

### CORS

The server allows the origin from `CLIENT_URL` (e.g. `https://YOUR_USERNAME.github.io`). Set `CLIENT_URL` on the backend to your full Pages URL.

Optional: `ALLOWED_ORIGINS` — comma-separated extra origins (e.g. `https://YOUR_USERNAME.github.io,http://localhost:3000`).

### Render troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot reach API" | GitHub secret `REACT_APP_API_URL` = `https://your-service.onrender.com` (no trailing slash). Re-deploy Pages after changing. |
| CORS error | On Render, set `CLIENT_URL` to your GitHub Pages URL. Check Render logs for blocked origin. |
| Slow first request | Free tier sleeps — wait ~30s or upgrade. Test `https://your-service.onrender.com/health` |
| Email `Connection timeout` | **Render free tier blocks all SMTP** (ports 587/465). Use `BREVO_API_KEY` (HTTPS API), not SMTP — see `server/SMTP.md` |
| `File no longer available` | Upload files on the **same API** users download from (your Render URL, not localhost). Deploy latest server (GridFS). Delete old library entries and **re-upload** on the live site, then create a new share link. |
| reCAPTCHA `timeout-or-duplicate` | Complete the checkbox again (each token works once). Do not double-click Register. |

Render env vars must include: `MONGO_URI`, `JWT_SECRET`, `RECAPTCHA_SECRET_KEY`, `CLIENT_URL`, and matching SMTP keys if using email.

## 5. Local Network Mode (Week 6)

Trusted-network detection compares each request’s IP to a subnet stored in MongoDB (registered by an **administrator** under **Network** in the app).

- Works when the **API runs on your LAN** (e.g. `http://192.168.1.x:8080`) and clients use that same network.
- **Render / cloud hosting** sees public internet IPs, not your home Wi-Fi subnet — use Local Network Mode for **local or on-prem** deployments, or lab testing with `ALLOWED_ORIGINS` including your LAN frontend URL.
- First registered user becomes **admin**, or set `ADMIN_EMAIL` on the server to promote an account.
- Optional: `FILE_STORAGE=disk` for fully local file storage.

### Local mode from GitHub Pages

Users download **HomeShare-Local-Windows.zip** from the site (no Node/Git install). Unzip → run `Start HomeShare.bat` → set `MONGO_URI` on first launch → **Detect local server** on the website.

Maintainers: `cd server && npm run build:local-package` (Windows). The Pages deploy workflow builds this ZIP automatically on each push to `main`.

## 6. Activation emails in production

Set `CLIENT_URL` on the backend to your GitHub Pages URL so activation links open the live site, not `localhost`.

## 7. Local vs production

| | Local | GitHub Pages |
|--|--------|----------------|
| Frontend | http://localhost:3000 | https://USER.github.io/IWP-HomeShare/ |
| API | http://localhost:8080 | Your Render (or other) URL |
