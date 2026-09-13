> **Using Render instead of Cloud Run?** See `RENDER_DEPLOYMENT.md` —
> free, no credit card required, ever. Everything below (steps 1–2) is
> replaced by that guide; steps 3–6 (first RHU login, Hosting deploy,
> redeploying) still apply.

# Deploying to Firebase Hosting + Cloud Run (HTTPS, public domain)

This moves you off "one PC on the office LAN" onto a real HTTPS URL
(`https://<your-project>.web.app` by default, or a custom domain later),
using free/low-cost pieces of the Firebase/Google Cloud stack you're
already on:

- **Firebase Hosting** — serves `index.html`, `barangay.html`, `rhu.html`,
  `config.js` over HTTPS with a free SSL cert, automatically.
- **Cloud Run** — runs `server/server.js` (SMS sending, login, register)
  as a container. Scales to zero when idle, so cost stays near-zero for a
  municipal-scale app.
- Hosting is configured (`firebase.json`) to transparently proxy
  `/login`, `/send`, `/send-bulk`, etc. to Cloud Run, so the browser
  only ever talks to one HTTPS domain — no CORS headaches, no exposed
  ports.

Do the **security setup steps first** if you haven't (SECURITY_SETUP.md)
— you need Firestore rules deployed before this is safe to expose
publicly.

## 0. One-time tool install

```bash
npm install -g firebase-tools
```
Also install the [gcloud CLI](https://cloud.google.com/sdk/docs/install) if
you don't have it (Cloud Run deploys through it).

```bash
firebase login
gcloud auth login
gcloud config set project dengue-alert-janiuay   # your Firebase project ID
```

## 1. Deploy the server to Cloud Run

From the **project root** (where `Dockerfile` is):

```bash
gcloud run deploy dengue-alert-server \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars API_KEY=<paste the value from server/.env>,SEMAPHORE_API_KEY=<your Semaphore key>,ALLOWED_ORIGINS=https://dengue-alert-janiuay.web.app
```

(`--allow-unauthenticated` is required — it just means "the public can
reach this HTTPS endpoint", not "no login required"; your own `API_KEY`
check and Firestore rules still gate everything that matters.)

This builds the `Dockerfile` via Cloud Build and deploys it — no manual
Docker install needed. Note the service URL it prints; you can test it
directly (`curl https://.../health`) before wiring up Hosting.

## 2. Let Cloud Run talk to Firestore without a key file

Find the Cloud Run service's identity and grant it Firestore + Auth access:

```bash
gcloud run services describe dengue-alert-server --region asia-southeast1 \
  --format='value(spec.template.spec.serviceAccountName)'
```

Then grant that service account (usually
`PROJECT_NUMBER-compute@developer.gserviceaccount.com`) these roles in
**Firebase Console → Project settings → Users and permissions**, or via:

```bash
gcloud projects add-iam-policy-binding dengue-alert-janiuay \
  --member="serviceAccount:<the service account from above>" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding dengue-alert-janiuay \
  --member="serviceAccount:<the service account from above>" \
  --role="roles/firebaseauth.admin"
```

`server.js` already detects it's running on Cloud Run and uses these
permissions automatically — no `serviceAccountKey.json` needed in
production (that file is for local dev only).

## 3. Create the first RHU login (production Firestore)

Same as local setup, just point at the same project — either run
`node server/scripts/seed-rhu-admin.js "..." "..." "..."` locally with
your local service account key (it writes to the same Firestore
database), or open Firebase Console → Firestore → `admin` collection
and add a document by hand with a bcrypt-hashed password (harder to do
by hand — the script is easier).

## 4. Deploy Hosting

```bash
firebase deploy --only hosting
```

Firebase prints your live URL, something like:
`https://dengue-alert-janiuay.web.app`

Open it, log in, and confirm SMS sending and login both work over
HTTPS. If `region` in `firebase.json`'s rewrites doesn't match where
you deployed Cloud Run in step 1, hosting rewrites will 404 — keep them
in sync (`asia-southeast1` is pre-filled since it's closest to the
Philippines).

## 5. (Optional) Custom domain

Firebase Console → Hosting → **Add custom domain** (e.g.
`dengue.janiuay.gov.ph`) and follow the DNS verification steps shown
there — Firebase issues and renews the SSL certificate automatically.

## 6. Redeploying after future code changes

```bash
gcloud run deploy dengue-alert-server --source . --region asia-southeast1   # after server.js changes
firebase deploy --only hosting                                              # after html/config.js changes
```
