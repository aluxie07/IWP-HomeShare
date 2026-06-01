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

## 5. Activation emails in production

Set `CLIENT_URL` on the backend to your GitHub Pages URL so activation links open the live site, not `localhost`.

## Local vs production

| | Local | GitHub Pages |
|--|--------|----------------|
| Frontend | http://localhost:3000 | https://USER.github.io/IWP-HomeShare/ |
| API | http://localhost:8080 | Your Render (or other) URL |
