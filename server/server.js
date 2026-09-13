/**
 * ============================================================
 *  DENGUE ALERT SYSTEM — SMS Server
 *  Node.js + Express + Semaphore SMS API
 *  Municipality of Janiuay, Iloilo
 * ============================================================
 *
 *  HOW TO RUN:
 *    1. cd dengue-alert-system/server
 *    2. npm install
 *    3. node server.js
 *
 *  Server runs at http://localhost:3001
 *
 *  Uses Semaphore (https://semaphore.co) — an SMS gateway built
 *  for the Philippines, covering all local networks (Globe,
 *  Smart, Sun, DITO) at a fraction of the cost of international
 *  providers like Twilio. See README notes at the bottom of
 *  this file for setup details.
 * ============================================================
 */

// Load .env from THIS file's directory — works no matter where you run node from
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express    = require('express');
const axios      = require('axios');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const os         = require('os');
const bcrypt     = require('bcryptjs');

const app  = express();
const PORT = process.env.PORT || 3001;

const SEMAPHORE_BASE_URL = 'https://semaphore.co/api/v4';

// ── STATIC FILES (serves index.html, rhu.html, barangay.html, config.js) ──
// Parent directory = dengue-alert-system/
const STATIC_DIR = path.join(__dirname, '..');
app.use(express.static(STATIC_DIR));

// ── STARTUP CHECKS ───────────────────────────────────────────
if (!process.env.API_KEY) {
  console.warn('\n⚠️  WARNING: API_KEY is not set in server/.env — SMS-sending endpoints');
  console.warn('   will be REJECTED (fail-closed) until you set one. Generate one with:');
  console.warn('   node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"\n');
}

// ── FIREBASE ADMIN (server-side auth: login / register / password reset) ──
// Local dev: uses a downloaded service account key (see SECURITY_SETUP.md).
// Cloud Run: uses Application Default Credentials automatically — no key
// file needed, just grant the Cloud Run service account Firestore + Auth
// permissions (see DEPLOYMENT.md).
// Render (or any non-GCP host): there's no key file on disk and no ADC, so
// paste the full service account JSON into a FIREBASE_SERVICE_ACCOUNT_JSON
// environment variable in the Render dashboard instead — checked first,
// below. Until one of the three is configured, /login, /register and
// /forgot-password/* return 503 so the rest of the server (SMS sending)
// still works.
let admin = null;
let authAvailable = false;
try {
  admin = require('firebase-admin');
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Render / Railway / etc: paste the whole downloaded JSON key as the
    // value of this env var (dashboard env vars support multiline values).
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    authAvailable = true;
    console.log('[DengueAlert] Firebase Admin initialized (FIREBASE_SERVICE_ACCOUNT_JSON) — /login, /register enabled');
  } else {
    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      ? path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
      : null;
    if (saPath && require('fs').existsSync(saPath)) {
      admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
      authAvailable = true;
      console.log('[DengueAlert] Firebase Admin initialized (service account key) — /login, /register enabled');
    } else if (process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT) {
      // K_SERVICE is set automatically by Cloud Run — safe signal we're
      // running on GCP and can use Application Default Credentials.
      admin.initializeApp();
      authAvailable = true;
      console.log('[DengueAlert] Firebase Admin initialized (Application Default Credentials) — /login, /register enabled');
    } else {
      console.warn('[DengueAlert] No Firebase Admin credentials found — /login, /register, /forgot-password disabled (see SECURITY_SETUP.md)');
    }
  }
} catch (e) {
  console.warn('[DengueAlert] Firebase Admin init failed — auth endpoints disabled:', e.message);
}
function requireAuthBackend(req, res, next) {
  if (!authAvailable) return res.status(503).json({ success: false, error: 'Server-side auth is not configured yet. See SECURITY_SETUP.md.' });
  next();
}

// ── MIDDLEWARE ───────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// CORS: reads ALLOWED_ORIGINS from .env (comma-separated). "*" allows any
// origin (fine for local LAN pilots, NOT recommended once publicly hosted).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const smsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: 'Too many requests. Please slow down.' }
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many attempts. Please wait a minute and try again.' }
});

// Fail-closed: if API_KEY isn't set, SMS-sending routes are rejected instead
// of silently left open.
function apiKeyAuth(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return res.status(503).json({ success: false, error: 'Server not configured: API_KEY missing in server/.env' });
  if (req.headers['x-api-key'] !== apiKey)
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}

// ── PHONE NUMBER NORMALIZATION ──────────────────────────────
// Accepts 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX and normalizes
// to the 09XXXXXXXXX format Semaphore expects.
function normalizePhone(raw) {
  if (!raw) return null;
  let n = String(raw).trim().replace(/[\s\-()]/g, '');
  if (n.startsWith('+63')) n = '0' + n.slice(3);
  else if (n.startsWith('63') && n.length === 12) n = '0' + n.slice(2);
  if (!/^09\d{9}$/.test(n)) return null;
  return n;
}

// ── HELPERS ──────────────────────────────────────────────────

function friendlyError(err) {
  const data = err.response?.data;
  const status = err.response?.status;
  if (status === 401 || status === 403)
    return 'Semaphore API key rejected — check SEMAPHORE_API_KEY in server/.env';
  if (data?.message) return data.message;
  if (Array.isArray(data) && data[0]?.message) return data[0].message;
  if (err.code === 'ECONNABORTED') return 'Semaphore request timed out — check your internet connection';
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') return 'Cannot reach Semaphore API — check internet/firewall';
  return err.message || 'Unknown error sending SMS';
}

// Sends one message to one or more numbers (Semaphore allows comma-separated
// numbers, up to 1000, in a single request — used for bulk sends).
async function doSendSms(numbers, message) {
  const apikey     = process.env.SEMAPHORE_API_KEY;
  const sendername = process.env.SEMAPHORE_SENDER_NAME || undefined;
  if (!apikey) throw new Error('SEMAPHORE_API_KEY is not set in server/.env');

  const params = { apikey, number: numbers.join(','), message };
  if (sendername) params.sendername = sendername;

  const { data } = await axios.post(`${SEMAPHORE_BASE_URL}/messages`, null, {
    params,
    timeout: 15000
  });
  // Semaphore returns an array — one entry per recipient
  return Array.isArray(data) ? data : [data];
}

// ── ROUTES ───────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Dengue Alert SMS Server',
    municipality: 'Janiuay, Iloilo',
    sms_provider: 'Semaphore',
    sms_configured: !!process.env.SEMAPHORE_API_KEY,
    sender_name: process.env.SEMAPHORE_SENDER_NAME || 'not set (uses default Semaphore sender)',
    version: '2.0.0'
  });
});

app.get('/test-connection', apiKeyAuth, async (req, res) => {
  try {
    const apikey = process.env.SEMAPHORE_API_KEY;
    if (!apikey) throw new Error('SEMAPHORE_API_KEY is not set in server/.env');
    const { data } = await axios.get(`${SEMAPHORE_BASE_URL}/account`, {
      params: { apikey },
      timeout: 10000
    });
    res.json({
      success: true,
      message: `Semaphore connected! Account: ${data.account_name || data.email || 'OK'} — Credit balance: ${data.credit_balance ?? 'unknown'}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: friendlyError(err) });
  }
});

// ── AUTH ROUTES (server-mediated login/register) ───────────────
// Passwords are hashed with bcrypt and never leave this server. The
// browser never reads the admin/bhw_accounts collections directly —
// Firestore rules deny that (see firestore.rules). On successful login
// we mint a Firebase custom token carrying the user's role as a claim,
// so Firestore rules can check request.auth.token.role for every other
// collection (dengue_cases, sms_logs, interventions).

app.post('/register', authLimiter, requireAuthBackend, async (req, res) => {
  try {
    const { name, barangay, phone, email, password } = req.body;
    if (!name || !barangay || !email || !password)
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    if (password.length < 8)
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });

    const db = admin.firestore();
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await db.collection('bhw_accounts').where('email', '==', normalizedEmail).get();
    if (!existing.empty)
      return res.status(409).json({ success: false, error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    await db.collection('bhw_accounts').add({
      name, barangay, phone: phone || '', email: normalizedEmail,
      passwordHash, status: 'pending', role: 'bhw',
      registered_at: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[DengueAlert] /register error:', err.message);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

app.post('/login', authLimiter, requireAuthBackend, async (req, res) => {
  try {
    const { role, username, password, barangay } = req.body;
    if (!role || !username || !password)
      return res.status(400).json({ success: false, error: 'Missing required fields' });

    const db = admin.firestore();
    const collection = role === 'rhu' ? 'admin' : 'bhw_accounts';
    const email = String(username).trim().toLowerCase();
    const snap = await db.collection(collection).where('email', '==', email).get();
    if (snap.empty)
      return res.status(401).json({ success: false, error: 'Invalid login credentials' });

    const doc  = snap.docs[0];
    const user = { id: doc.id, ...doc.data() };

    // Support existing plaintext-password seed accounts on first login by
    // upgrading them to a bcrypt hash transparently.
    let passwordOk = false;
    if (user.passwordHash) {
      passwordOk = await bcrypt.compare(password, user.passwordHash);
    } else if (user.password) {
      passwordOk = user.password === password;
      if (passwordOk) {
        const passwordHash = await bcrypt.hash(password, 10);
        await doc.ref.update({ passwordHash, password: admin.firestore.FieldValue.delete() });
      }
    }
    if (!passwordOk)
      return res.status(401).json({ success: false, error: 'Invalid login credentials' });

    const normalizedRole = user.role === 'barangay' ? 'bhw' : user.role;
    if (role === 'rhu' && normalizedRole !== 'rhu' && normalizedRole !== 'admin')
      return res.status(403).json({ success: false, error: 'This account does not have RHU access' });
    if (role === 'barangay' && normalizedRole !== 'bhw')
      return res.status(403).json({ success: false, error: 'This account does not have Barangay access' });
    if (user.status === 'pending')
      return res.status(403).json({ success: false, error: 'Your account is pending RHU approval' });
    if (user.status === 'rejected')
      return res.status(403).json({ success: false, error: 'Your registration was not approved' });

    const claims = { role: normalizedRole, barangay: barangay || user.barangay || '', name: user.name || '' };
    const token = await admin.auth().createCustomToken(user.id, claims);

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, role: normalizedRole, barangay: claims.barangay, name: user.name }
    });
  } catch (err) {
    console.error('[DengueAlert] /login error:', err.message);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Matches the existing (email-only, no verification link) reset flow —
// hardened to run server-side with hashing instead of exposing the
// accounts collection to the browser. Recommend adding real email
// verification before relying on this for production use.
app.post('/forgot-password/find', authLimiter, requireAuthBackend, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    const db = admin.firestore();
    const snap = await db.collection('bhw_accounts').where('email', '==', email).where('role', '==', 'bhw').get();
    if (snap.empty) return res.status(404).json({ success: false, error: 'No registered account found with that email address' });
    res.json({ success: true, accountId: snap.docs[0].id });
  } catch (err) {
    console.error('[DengueAlert] /forgot-password/find error:', err.message);
    res.status(500).json({ success: false, error: 'Lookup failed' });
  }
});

app.post('/forgot-password/reset', authLimiter, requireAuthBackend, async (req, res) => {
  try {
    const { accountId, newPassword } = req.body;
    if (!accountId || !newPassword || newPassword.length < 8)
      return res.status(400).json({ success: false, error: 'Invalid request' });
    const db = admin.firestore();
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.collection('bhw_accounts').doc(accountId).update({
      passwordHash, password: admin.firestore.FieldValue.delete(),
      password_updated_at: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[DengueAlert] /forgot-password/reset error:', err.message);
    res.status(500).json({ success: false, error: 'Reset failed' });
  }
});

// ── SEND ROUTES ──────────────────────────────────────────────

app.post('/send', apiKeyAuth, smsLimiter, async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message)
    return res.status(400).json({ success: false, error: 'Missing fields: to, message' });

  const number = normalizePhone(to);
  if (!number)
    return res.status(400).json({ success: false, error: `Invalid Philippine mobile number: ${to}` });

  try {
    const results = await doSendSms([number], message);
    console.log(`[DengueAlert] SMS sent → ${number}`);
    res.json({ success: true, messageId: results[0]?.message_id, status: results[0]?.status });
  } catch (err) {
    const msg = friendlyError(err);
    console.error(`[DengueAlert] /send FAILED → ${number}:`, msg);
    res.status(500).json({ success: false, error: msg });
  }
});

app.post('/send-bulk', apiKeyAuth, smsLimiter, async (req, res) => {
  const { recipients, message } = req.body;
  if (!recipients?.length || !message)
    return res.status(400).json({ success: false, error: 'Missing fields: recipients, message' });

  // Normalize + validate all numbers up front
  const valid   = [];
  const invalid = [];
  for (const r of recipients) {
    const n = normalizePhone(r.contact || r.number || r.phone);
    if (n) valid.push({ ...r, number: n });
    else invalid.push(r);
  }

  const results = invalid.map(r => ({
    contact: r.contact || r.number || r.phone,
    success: false,
    error: 'Invalid Philippine mobile number'
  }));

  // Semaphore supports up to 1000 numbers per request — chunk to be safe
  const CHUNK_SIZE = 300;
  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE);
    try {
      const data = await doSendSms(chunk.map(c => c.number), message);
      chunk.forEach((c, idx) => {
        const entry = data[idx] || data[0];
        console.log(`[DengueAlert] Bulk SMS sent → ${c.number}`);
        results.push({ contact: c.number, success: true, messageId: entry?.message_id, status: entry?.status });
      });
    } catch (err) {
      const msg = friendlyError(err);
      console.error(`[DengueAlert] Bulk SMS error →`, msg);
      chunk.forEach(c => results.push({ contact: c.number, success: false, error: msg }));
    }
  }

  const sent   = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  res.json({ success: true, sent, failed, total: recipients.length, results });
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  // Get local network IP
  const nets = os.networkInterfaces();
  let localIP = 'YOUR-PC-IP';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
  }

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   🦟  Dengue Alert System  v2.0 (SMS)        ║`);
  console.log(`║   Municipality of Janiuay, Iloilo            ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  console.log(`\n  Open the system in your browser:\n`);
  console.log(`  📌 This PC:        http://localhost:${PORT}`);
  console.log(`  🌐 Other devices:  http://${localIP}:${PORT}`);
  console.log(`\n  (Any phone/tablet on the same WiFi can use the 🌐 link)\n`);
  console.log(`  SMS provider: Semaphore (${process.env.SEMAPHORE_API_KEY ? 'API key set' : 'NOT CONFIGURED — set SEMAPHORE_API_KEY in server/.env'})`);
  console.log(`\n  Press Ctrl+C to stop the server.\n`);
});

module.exports = app;
