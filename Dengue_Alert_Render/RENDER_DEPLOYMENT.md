# Deploying server.js to Render (free, no credit card)

This replaces **only** the Cloud Run part of DEPLOYMENT.md. Hosting,
Firestore, and Auth stay exactly as planned — `index.html`, `barangay.html`,
`rhu.html`, `config.js` still go to Firebase Hosting. Just `server/` (the
SMS/login server) moves to Render instead of Cloud Run.

**Trade-off:** Render's free tier sleeps after ~15 minutes of no traffic.
The first request after a quiet spell takes 30–60 seconds to wake up —
fine for a pilot, a little annoying if the office goes quiet then someone
tries to log in.

Do the security setup first if you haven't (SECURITY_SETUP.md) — you need
Firestore rules deployed before this is safe to expose publicly.

## 1. Push the project to GitHub

Render deploys from a GitHub repo. If you don't already have one:

```bash
cd Dengue_Alert
git init
git add .
git commit -m "Initial commit"
```

Check `git status` before committing — `.gitignore` already excludes
`server/.env` and `server/serviceAccountKey.json`, but glance at the file
list it's about to commit and make sure neither shows up.

Then create an empty repo on https://github.com/new (no README/license —
keep it empty so it doesn't conflict with what you have locally), and:

```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

## 2. Create the Render Web Service

1. Go to https://render.com → sign up (GitHub login is easiest, no card
   needed for the free tier).
2. **New +** → **Web Service** → connect the GitHub repo you just pushed.
3. Fill in:
   - **Root Directory:** `server` (this tells Render to treat
     `server/` as the app root — it'll run `npm install` and `npm start`
     from inside there, using `server/package.json`)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Click **Create Web Service**. It'll deploy immediately — this first
   deploy will show as "live" but `/login` etc. will 503 until step 3
   below, since Firebase Admin has no credentials yet.

## 3. Add environment variables

In the Render service → **Environment** tab, add:

| Key | Value |
|---|---|
| `SEMAPHORE_API_KEY` | from `server/.env` locally |
| `SEMAPHORE_SENDER_NAME` | from `server/.env` locally |
| `API_KEY` | from `server/.env` locally (or generate a new one — see below) |
| `ALLOWED_ORIGINS` | `https://dengue-alert-janiuay.web.app` (your Firebase Hosting URL — add your custom domain here too later, comma-separated) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | the **entire contents** of `server/serviceAccountKey.json`, pasted as one value |

To generate a fresh `API_KEY` if you'd rather not reuse the local one:
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

For `FIREBASE_SERVICE_ACCOUNT_JSON`: open `server/serviceAccountKey.json`
in a text editor, select all, copy, and paste the whole JSON blob
(including the `{ }`) into that one environment variable's value field.
Render's env var fields accept multiline values, so this works fine.

Click **Save Changes** — Render redeploys automatically. Check the Logs
tab for:
```
[DengueAlert] Firebase Admin initialized (FIREBASE_SERVICE_ACCOUNT_JSON) — /login, /register enabled
```

## 4. Note your Render URL and wire up config.js

Render shows your service URL at the top of the dashboard, something like:
```
https://dengue-alert-server.onrender.com
```

Open `config.js` (already edited to expect this) and replace the two
placeholders:

```js
const SMS_SERVER_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? `${window.location.protocol}//${window.location.host}`
  : 'https://dengue-alert-server.onrender.com';   // ← your real Render URL

const SMS_SERVER_API_KEY = 'the-same-API_KEY-value-you-set-in-Render';
```

Test it directly first: `curl https://dengue-alert-server.onrender.com/health`
should return JSON (give it a minute if it was asleep).

## 5. Deploy Hosting

```bash
firebase deploy --only hosting
```

Open the printed URL, log in, and confirm SMS sending and login both work.
If login/SMS calls fail with a CORS error in the browser console, double
check `ALLOWED_ORIGINS` on Render matches your Hosting URL exactly
(including `https://`, no trailing slash).

## 6. Redeploying after future code changes

- **Server changes** (`server/server.js`, etc.): just `git push` — Render
  redeploys automatically on every push to `main`.
- **Frontend changes** (`index.html`, `barangay.html`, `rhu.html`,
  `config.js`): `firebase deploy --only hosting`.

## Why this differs from DEPLOYMENT.md

`DEPLOYMENT.md` (Cloud Run) relies on Firebase Hosting's `rewrites` to
proxy `/login`, `/send`, etc. to the same domain — that only works because
Cloud Run is a Google product Hosting knows how to rewrite to. Render is
an external host, so Hosting can't proxy to it; the frontend now calls
Render's URL directly (cross-origin), which is why `ALLOWED_ORIGINS` and
`SMS_SERVER_API_KEY` matter more here than they did before.
