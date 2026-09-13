# Security setup — steps only you can do

Everything that could be fixed in code has been fixed (see "What changed"
below). The steps below need your actual Firebase console / hosting
access, which I don't have, so here's exactly what to click and run.

Do these **in order**. Nothing works fully until step 3 is done.

## 1. Deploy the Firestore security rules

1. Go to https://console.firebase.google.com → your project → **Firestore
   Database → Rules**.
2. Open `firestore.rules` (project root) in this folder, select all,
   copy it.
3. Paste it into the console's Rules editor, replacing what's there.
4. Click **Publish**.

This is the single most important step — it's what stops anyone with
the browser console from reading or writing patient case data, and
what closes the "Test Mode" 30-day-open-to-everyone window.

## 2. Generate a Firebase service account key

The new `/login`, `/register`, and password-reset endpoints in
`server/server.js` need this to talk to Firestore as an admin (so the
browser never has to read the `admin`/`bhw_accounts` collections
directly).

1. Firebase console → gear icon → **Project settings → Service accounts**.
2. Click **Generate new private key** → confirm. A `.json` file downloads.
3. Rename it `serviceAccountKey.json` and put it in the `server/` folder
   (next to `server.js`). It's already covered by `.gitignore`, so it
   won't get committed or zipped up by accident — **never share this
   file or paste its contents anywhere**, it grants full read/write
   access to your whole Firestore database.
4. Confirm `server/.env` has:
   ```
   FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
   ```
   (already set to this by default).

## 3. Install dependencies and create the first RHU login

```bash
cd server
npm install
node scripts/seed-rhu-admin.js "Dr. Jane Dela Cruz" rhu@janiuay.gov.ph "a-strong-password-here"
```

This creates the first RHU account directly in Firestore (RHU accounts
aren't self-registered on purpose — only BHWs can sign up from the
login page and wait for RHU approval). Run this once; run it again
later with different details any time you need another RHU login.

## 4. Start the server and test

```bash
node server.js
```

Open `http://localhost:3001` and log in as RHU with the account from
step 3. Try registering a BHW account from the login page, then
approve it from the RHU dashboard — that confirms the whole
login → Firestore-rules → dashboard chain is working.

## 5. Before going beyond a single-office pilot

- **Set a real `ALLOWED_ORIGINS`** in `server/.env` (currently `*`) once
  you have a real domain, e.g. `ALLOWED_ORIGINS=https://dengue.janiuay.gov.ph`.
- **Put it behind HTTPS.** The easiest path, since you're already on
  Firebase, is Firebase Hosting for the static files + Cloud Run for
  `server.js`, with Hosting transparently proxying the API routes — this
  is fully wired up already (`firebase.json`, `Dockerfile`). See
  **`DEPLOYMENT.md`** for the exact commands. A LAN-only,
  `start-server.bat`-launched setup is fine for a pilot on one RHU
  machine, not for anything public-facing.
- Rotate `API_KEY` in `server/.env` periodically, and immediately if this
  folder is ever shared/zipped/uploaded anywhere with `.env` still in it
  (check `.gitignore` did its job first).

---

## What changed already (no action needed from you)

- **`server/server.js`**: `/send` and `/send-bulk` now fail closed if
  `API_KEY` isn't set (previously: silently open). CORS now reads
  `ALLOWED_ORIGINS` from `.env` instead of being hardcoded to `*`. Added
  `/login`, `/register`, `/forgot-password/find`, `/forgot-password/reset`
  — passwords are bcrypt-hashed and compared server-side; the browser
  never reads raw account documents anymore. A generated `API_KEY` is
  already in `server/.env`.
- **`firestore.rules`** (new): denies all unauthenticated access;
  role-based access (`rhu`/`admin`/`bhw`) enforced via custom claims set
  at login.
- **`config.js`**: added an `AUTH` helper that calls the new server
  endpoints instead of querying Firestore directly for login/registration;
  `SESSION.logout()` now actually signs out of Firebase Auth, not just
  localStorage.
- **`index.html`**: login, registration, and forgot-password now go
  through `AUTH`/the server instead of direct Firestore reads/writes.
- **`.gitignore`** (new): keeps `server/.env` and `server/serviceAccountKey.json`
  out of version control and future zips.
- **Legacy Supabase files** (`database/schema.sql`, `fix_rls.sql`) moved
  to `database/_legacy-unused-supabase/` with a README — the app runs on
  Firebase, these weren't wired to anything.
