# Email on Render (important)

## Render free tier blocks SMTP

Render **blocks outbound ports 25, 465, and 587** on free web services.  
So **Brevo SMTP will always time out** on Render free tier—even with correct credentials.

SMTP still works on **localhost** for development.

## Fix: Brevo HTTP API (works on Render free tier)

Uses HTTPS (port 443), not SMTP.

### 1. Brevo dashboard

1. [brevo.com](https://www.brevo.com) → **SMTP & API** → **API keys** → create a key  
2. **Senders** → add and verify your sender email  

### 2. Render environment variables

Remove or ignore SMTP vars on Render. Set:

```env
BREVO_API_KEY=xkeysib-your-api-key-here
EMAIL_FROM=your-verified-sender@example.com
EMAIL_FROM_NAME=HomeShare
CLIENT_URL=https://yourusername.github.io/IWP-HomeShare
```

### 3. Redeploy and test

Open: `https://your-app.onrender.com/health/smtp`

Expected: `{ "ok": true, "message": "Brevo API connection verified (HTTPS)" }`

### 4. Local development

**Option A — API (same as production):** use `BREVO_API_KEY` in `server/.env`  

**Option B — SMTP:** use Gmail/Brevo SMTP in `server/.env` (only works locally)

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM=...
```

Do **not** rely on SMTP when `RENDER=true` unless you upgrade to a **paid** Render instance.

## Paid Render

Paid instances can use SMTP on ports 465/587 again. API is still recommended.
