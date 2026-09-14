/**
 * ============================================================
 *  DENGUE ALERT SYSTEM — Configuration (Firebase edition)
 *  Municipality of Janiuay, Iloilo
 * ============================================================
 *
 *  SETUP (5 minutes):
 *
 *  1. Go to https://console.firebase.google.com
 *  2. Click "Add project" → name it "dengue-alert-janiuay" → Create
 *  3. On the project page, click the </> (Web) icon → Register app
 *  4. Copy the firebaseConfig values below from the snippet shown
 *  5. In the left sidebar: Build → Firestore Database → Create database
 *     → Start in TEST MODE → choose a region near you → Enable
 *  6. Done! Open index.html and log in.
 *
 * ============================================================
 */

// ── PASTE YOUR FIREBASE CONFIG HERE ──────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBIxeY_mpXpPcJ0wrDbXAIIHSL6lXxGtTs",
  authDomain: "dengue-alert-janiuay.firebaseapp.com",
  projectId: "dengue-alert-janiuay",
  storageBucket: "dengue-alert-janiuay.firebasestorage.app",
  messagingSenderId: "1067881251632",
  appId: "1:1067881251632:web:37fcbaa1b7123a94263ef5",
  measurementId: "G-VZ6V3LXR2H"
};

// ── CREDENTIALS ──────────────────────────────────────────────
// Accounts are now stored in Firestore `users` collection.
// To add/remove users, edit them directly in Firebase Console → Firestore → users.
const USERS = []; // kept for localStorage fallback only (no hardcoded accounts)

// ── SMS SERVER CONFIG (Semaphore API, via server/server.js) ──
// The server now runs on Render, on its own domain — no more same-origin
// Firebase Hosting rewrites (Render can't sit behind those). Locally
// (running server.js yourself, e.g. via start-server.bat) this still
// resolves correctly because window.location is localhost:3001, which IS
// where the server is. In production it points straight at Render.
const SMS_SERVER_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? `${window.location.protocol}//${window.location.host}`
  : 'https://dengue-alert-system.onrender.com'; // ← paste your Render service URL here after step 3 below

// Must match the API_KEY you set in Render's environment variables (see
// RENDER_DEPLOYMENT.md) — sent as the X-API-Key header on every /send call.
const SMS_SERVER_API_KEY = '9d247581aa63ede8060c4f59208e38b7a4395f541f429037';

// ── SYSTEM CONFIG ────────────────────────────────────────────
const SYSTEM_CONFIG = {
  municipality:      'Municipality of Janiuay',
  province:          'Iloilo',
  rhuEmail:          'acantojett22@gmail.com',
  outbreakThreshold: 5,
  alertWindowDays:   14,
  systemName:        'Dengue Alert',
  version:           '1.0.0',

  barangays: [
    'Abangay','Agcarope','Aglobong','Aguingay','Anhawan',
    'Aquino Nobleza East (Pob.)','Aquino Nobleza West (Pob.)',
    'Atimonan','Balanac','Barasalon','Bongol','Cabantog',
    'Calmay','Canawili','Canawillian','Capt. A. Tirador (Pob.)',
    'Caranas','Caraudan','Carigangan',
    'Concepcion Pob. (D.G. Abordo)',
    'Crispin Salazar North (Pob.)','Crispin Salazar South (Pob.)',
    'Cunsad','Dabong','Damires','Damo-ong','Danao',
    'Don T. Lutero Center (Pob.)','Don T. Lutero East (Pob.)',
    'Don T. Lutero West (Pob.)','Gines','Golgota (Pob.)',
    'Guadalupe','Jibolo','Kuyot','Locsin (Pob.)','Madong',
    'Manacabac','Mangil','Matag-ub','Monte-Magapa','Pangilihan',
    'Panuran','Pararinga','Patong-patong','Quipot',
    'R. Armada (Pob.)','S. M. Villa (Pob.)','San Julian (Pob.)',
    'San Pedro (Pob.)','Santa Rita (Pob.)','Santo Tomas',
    'Sarawag','Tambal','Tamu-an','Tiringanan','Tolarucan',
    'Tuburan','Ubian','Yabon'
  ]
};

// ── DENGUE CASE TYPE (per DOH/WHO clinical classification) ─────
// Type N = Dengue without Warning Signs
// Type W = Dengue with Warning Signs
// Type S = Severe Dengue
//
// IMPORTANT: this is the CLINICAL classification of a single patient's case
// (what used to be labeled "Mild / Moderate / Severe" in this system). It is
// a completely different concept from a barangay's "Risk Level" (Low /
// Medium / High) shown on the Risk Map, which measures 14-day outbreak
// activity for a whole barangay. Do NOT rename the Risk Map's Low/Medium/High
// — only case-level severity uses N/W/S.
const CASE_TYPES = {
  N: { code: 'N', short: 'Type N', name: 'No Warning Signs',   full: 'Dengue without Warning Signs', chip: 'low',    color: '#38a169', emoji: '🟢' },
  W: { code: 'W', short: 'Type W', name: 'With Warning Signs', full: 'Dengue with Warning Signs',     chip: 'medium', color: '#d69e2e', emoji: '🟡' },
  S: { code: 'S', short: 'Type S', name: 'Severe Dengue',      full: 'Severe Dengue',                 chip: 'high',   color: '#e53e3e', emoji: '🔴' }
};
// Records saved before this update used "Mild"/"Moderate"/"Severe" — map
// those legacy values to the new type codes so old cases still display and
// filter correctly. Accepts either the old or new value and always returns
// '', 'N', 'W', or 'S'.
function normalizeCaseType(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (s === 'N' || s === 'W' || s === 'S') return s;
  if (s === 'Mild')     return 'N';
  if (s === 'Moderate') return 'W';
  if (s === 'Severe')   return 'S';
  return '';
}
function caseTypeInfo(v)      { return CASE_TYPES[normalizeCaseType(v)] || null; }
function caseTypeLabel(v)     { const t = caseTypeInfo(v); return t ? `${t.short} — ${t.name}` : ''; }
function caseTypeShort(v)     { const t = caseTypeInfo(v); return t ? t.short : ''; }
function caseTypeFull(v)      { const t = caseTypeInfo(v); return t ? t.full : ''; }
function caseTypeChipClass(v) { const t = caseTypeInfo(v); return t ? t.chip : ''; }
function caseTypeColor(v)     { const t = caseTypeInfo(v); return t ? t.color : '#a0aec0'; }
function caseTypeEmoji(v)     { const t = caseTypeInfo(v); return t ? t.emoji : '⚪'; }
// Renders a ready-to-use chip for tables: shows the assigned Type (or "TBD"
// if the RHU hasn't classified it yet) plus a "Suspected" tag. Every case in
// this system is a Suspected case per DOH/WHO classification (S/P/C) unless
// the RHU has lab-confirmed it via NS1/PCR — this system exists to relay
// suspected-case information from the barangay to the RHU, not to declare
// lab-confirmed diagnoses.
function caseTypeChipHTML(v) {
  const t = caseTypeInfo(v);
  if (!t) return `<span class="chip" style="background:var(--warn-bg);color:var(--warn);border-color:rgba(237,201,74,0.3)">⏳ TBD · Suspected</span>`;
  return `<span class="chip ${t.chip}">${t.emoji} ${t.short} · Suspected</span>`;
}

// ── SYMPTOM CHECKLIST (per DOH/WHO clinical case definition) ───
// Grouped exactly like the case-definition reference sheet: each symptom is
// tagged with the case type it's a criterion for, so the Submit Case form
// can show a live "suggested type" as the BHW checks boxes. Final
// classification is still confirmed by the RHU.
const SYMPTOM_GROUPS = [
  {
    type: 'N',
    title: 'Dengue without Warning Signs',
    hint: 'Suspect: acute fever 2–7 days plus two or more of the following',
    symptoms: [
      { value: 'Headache', label: 'Headache' },
      { value: 'Body Malaise', label: 'Body malaise' },
      { value: 'Myalgia', label: 'Myalgia (muscle pain)' },
      { value: 'Arthralgia', label: 'Arthralgia (joint pain)' },
      { value: 'Retro-orbital Pain', label: 'Retro-orbital pain (behind the eyes)' },
      { value: 'Anorexia', label: 'Anorexia (loss of appetite)' },
      { value: 'Nausea', label: 'Nausea' },
      { value: 'Vomiting', label: 'Vomiting' },
      { value: 'Diarrhea', label: 'Diarrhea' },
      { value: 'Flushed Skin', label: 'Flushed skin' },
      { value: 'Rash', label: "Rash (petechial / Herman's sign)" }
    ]
  },
  {
    type: 'W',
    title: 'Dengue with Warning Signs',
    hint: 'Acute fever 2–7 days plus any one of the following',
    symptoms: [
      { value: 'Abdominal Pain', label: 'Abdominal pain or tenderness' },
      { value: 'Persistent Vomiting', label: 'Persistent vomiting' },
      { value: 'Fluid Accumulation', label: 'Clinical signs of fluid accumulation' },
      { value: 'Mucosal Bleeding', label: 'Mucosal bleeding' },
      { value: 'Lethargy Restlessness', label: 'Lethargy / restlessness' },
      { value: 'Liver Enlargement', label: 'Liver enlargement' },
      { value: 'Hct Platelet Lab', label: 'Lab: rising Hct and/or falling platelet count (if known)' }
    ]
  },
  {
    type: 'S',
    title: 'Severe Dengue',
    hint: 'Any warning sign plus any one of the following',
    symptoms: [
      { value: 'Shock', label: 'Severe plasma leakage — shock' },
      { value: 'Respiratory Distress', label: 'Severe plasma leakage — fluid accumulation with respiratory distress' },
      { value: 'Severe Bleeding', label: 'Severe bleeding' },
      { value: 'Liver Impairment', label: 'Severe organ impairment — liver (AST/ALT ≥1000)' },
      { value: 'CNS Impairment', label: 'Severe organ impairment — CNS (seizures, impaired consciousness)' },
      { value: 'Heart Impairment', label: 'Severe organ impairment — heart (e.g. myocarditis)' },
      { value: 'Kidney Impairment', label: 'Severe organ impairment — kidneys (renal failure)' }
    ]
  }
];
// Suggest a case type from a list of checked symptom values — takes the
// HIGHEST severity group that has at least one checked symptom (S > W > N).
// This is only a suggestion for the BHW/RHU; it is never auto-saved as the
// final classification.
function suggestCaseTypeFromSymptoms(checkedValues) {
  const checked = new Set(checkedValues || []);
  for (const t of ['S', 'W', 'N']) {
    const group = SYMPTOM_GROUPS.find(g => g.type === t);
    if (group && group.symptoms.some(s => checked.has(s.value))) return t;
  }
  return '';
}

// ── FIREBASE INIT ─────────────────────────────────────────────
// Uses Firebase v9 compat (no bundler needed — works in plain HTML)
let db, auth;
const _isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.apiKey !== 'YOUR_API_KEY_HERE');

if (_isConfigured) {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  auth = firebase.auth();
  console.log('[DengueAlert] Firebase connected');
} else {
  console.warn('[DengueAlert] Firebase not configured — falling back to localStorage');
}

// ── LOCAL STORAGE FALLBACK (used when Firebase not yet configured) ─
const _store = {
  get(key)  { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
  set(key,v){ try { localStorage.setItem(key, JSON.stringify(v)); } catch(e) { console.error(e); } },
  getCases()         { return this.get('da_cases')         || []; },
  saveCases(v)       { this.set('da_cases', v); },
  getSms()           { return this.get('da_sms_logs')      || []; },
  saveSms(v)         { this.set('da_sms_logs', v); },
  getInterventions() { return this.get('da_interventions') || []; },
  saveInterventions(v){ this.set('da_interventions', v); }
};

// ── DATABASE HELPERS ─────────────────────────────────────────
const DB = {

  async submitCase(caseData) {
    const newCase = {
      patient_name:    caseData.patientName,
      patient_age:     caseData.age,
      patient_sex:     caseData.sex,
      patient_address: caseData.address,
      patient_contact: caseData.contact || '',
      barangay:        caseData.barangay,
      onset_date:      caseData.onsetDate,
      report_date:     new Date().toISOString(),
      severity:        'Pending',   // RHU will assign the actual severity
      symptoms:        caseData.symptoms,
      status:          'Pending',
      submitted_by:       caseData.submittedBy,
      submitted_by_name:  caseData.submittedByName  || '',
      submitted_by_phone: caseData.submittedByPhone || '',
      notes:           caseData.notes  || '',
      rhu_notes:       '',
      reviewed_at:     null,
      is_active:       true   // whether this case still counts toward risk (RHU-controlled, see setCaseActive)
    };
    if (_isConfigured) {
      try {
        const ref = await db.collection('dengue_cases').add(newCase);
        return { data: { ...newCase, id: ref.id }, error: null };
      } catch(e) { return { data: null, error: e }; }
    } else {
      const cases = _store.getCases();
      newCase.id = 'case-' + Date.now();
      cases.unshift(newCase);
      _store.saveCases(cases);
      return { data: newCase, error: null };
    }
  },

  async getAllCases(filters = {}) {
    if (_isConfigured) {
      try {
        // No orderBy + where combo to avoid composite index requirements — sort client-side
        let q = db.collection('dengue_cases');
        if (filters.barangay) q = q.where('barangay', '==', filters.barangay);
        if (filters.status)   q = q.where('status',   '==', filters.status);
        if (filters.severity) q = q.where('severity', '==', filters.severity);
        const snap = await q.get();
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.report_date || '').localeCompare(a.report_date || ''));
        return { data, error: null };
      } catch(e) { return { data: [], error: e }; }
    } else {
      let cases = _store.getCases();
      if (filters.barangay) cases = cases.filter(c => c.barangay === filters.barangay);
      if (filters.status)   cases = cases.filter(c => c.status   === filters.status);
      if (filters.severity) cases = cases.filter(c => c.severity === filters.severity);
      return { data: cases, error: null };
    }
  },

  async getBarangayCases(barangay) {
    if (_isConfigured) {
      try {
        // Simple .where() only — no orderBy to avoid requiring a Firestore composite index
        // Sort by report_date client-side instead
        const snap = await db.collection('dengue_cases')
          .where('barangay', '==', barangay).get();
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.report_date || '').localeCompare(a.report_date || ''));
        return { data, error: null };
      } catch(e) { return { data: [], error: e }; }
    } else {
      const cases = _store.getCases().filter(c => c.barangay === barangay);
      cases.sort((a, b) => (b.report_date || '').localeCompare(a.report_date || ''));
      return { data: cases, error: null };
    }
  },

  async updateCaseStatus(caseId, status, notes = '', severity = null) {
    const updates = { status, rhu_notes: notes, reviewed_at: new Date().toISOString() };
    if (severity) updates.severity = severity;
    if (status === 'Confirmed') updates.is_active = true; // (re)confirming a case makes it active again
    if (_isConfigured) {
      try {
        await db.collection('dengue_cases').doc(caseId).update(updates);
        return { data: null, error: null };
      } catch(e) { return { data: null, error: e }; }
    } else {
      const cases = _store.getCases();
      const idx   = cases.findIndex(c => c.id === caseId);
      if (idx !== -1) { Object.assign(cases[idx], updates); _store.saveCases(cases); }
      return { data: null, error: null };
    }
  },

  // Manually mark a Confirmed case as Active or Inactive (resolved/recovered).
  // This is the RHU-controlled switch that the dashboard, risk map, and
  // barangay list all read from — it does NOT depend on onset date.
  async setCaseActive(caseId, isActive) {
    const updates = { is_active: isActive, active_changed_at: new Date().toISOString() };
    if (_isConfigured) {
      try {
        await db.collection('dengue_cases').doc(caseId).update(updates);
        return { data: null, error: null };
      } catch(e) { return { data: null, error: e }; }
    } else {
      const cases = _store.getCases();
      const idx   = cases.findIndex(c => c.id === caseId);
      if (idx !== -1) { Object.assign(cases[idx], updates); _store.saveCases(cases); }
      return { data: null, error: null };
    }
  },

  async getBarangayRisk() {
    // A Confirmed case counts toward the risk map / barangay list for as
    // long as it's marked Active — this is now RHU-controlled via the
    // Active/Inactive toggle, NOT an automatic 14-day onset-date cutoff.
    // (Previously a case silently dropped off the map after 14 days even
    // though it still showed in the "Active Cases" dashboard stat — this
    // unifies both around the same is_active flag.)
    // is_active is treated as true when missing, so older records created
    // before this field existed still count.
    let confirmed = [];
    if (_isConfigured) {
      try {
        const snap = await db.collection('dengue_cases')
          .where('status', '==', 'Confirmed').get();
        confirmed = snap.docs.map(d => d.data()).filter(c => c.is_active !== false);
      } catch(e) { return { data: [], error: e }; }
    } else {
      confirmed = _store.getCases().filter(c => c.status === 'Confirmed' && c.is_active !== false);
    }

    // Always build a summary entry for every barangay so the map shows all dots
    const summary = {};
    SYSTEM_CONFIG.barangays.forEach(b => { summary[b] = { barangay: b, cases: 0, severe: 0, risk: 'Low' }; });
    confirmed.forEach(c => {
      if (summary[c.barangay]) {
        summary[c.barangay].cases++;
        if (normalizeCaseType(c.severity) === 'S') summary[c.barangay].severe++;
      }
    });
    Object.values(summary).forEach(s => {
      if      (s.cases >= SYSTEM_CONFIG.outbreakThreshold) s.risk = 'High';
      else if (s.cases >= 3)                               s.risk = 'Medium';
    });
    return { data: Object.values(summary), error: null };
  },

  async logSms(smsData) {
    const entry = {
      type:            smsData.type,
      subject:         smsData.subject,
      recipient_to:    smsData.to,
      recipient_count: smsData.count || 1,
      barangay:        smsData.barangay || 'All',
      sent_by:         smsData.sentBy,
      sent_at:         new Date().toISOString()
    };
    if (_isConfigured) {
      try { await db.collection('sms_logs').add(entry); } catch(e) { console.warn('SMS log failed', e); }
    } else {
      const logs = _store.getSms(); logs.unshift({ id: 's-' + Date.now(), ...entry }); _store.saveSms(logs);
    }
    return { data: null, error: null };
  },

  async getSmsLogs(limit = 20) {
    if (_isConfigured) {
      try {
        const snap = await db.collection('sms_logs').orderBy('sent_at', 'desc').limit(limit).get();
        return { data: snap.docs.map(d => ({ id: d.id, ...d.data() })), error: null };
      } catch(e) { return { data: [], error: e }; }
    } else {
      return { data: _store.getSms().slice(0, limit), error: null };
    }
  },

  async getRecipientContacts(barangay = null) {
    if (_isConfigured) {
      try {
        // Fetch all cases, filter in JS — avoids composite index requirement
        const snap = await db.collection('dengue_cases').get();
        let data = snap.docs.map(d => d.data()).filter(c => c.patient_contact && c.patient_contact.trim() !== '');
        if (barangay) data = data.filter(c => c.barangay === barangay);
        return { data: data.map(c => ({ patient_contact: c.patient_contact, patient_name: c.patient_name, barangay: c.barangay })), error: null };
      } catch(e) { return { data: [], error: e }; }
    } else {
      let cases = _store.getCases().filter(c => c.patient_contact && c.patient_contact.trim() !== '');
      if (barangay) cases = cases.filter(c => c.barangay === barangay);
      return { data: cases.map(c => ({ patient_contact: c.patient_contact, patient_name: c.patient_name, barangay: c.barangay })), error: null };
    }
  },

  async logIntervention(data) {
    const entry = { type: data.type, barangay: data.barangay, date: data.date, description: data.description, logged_by: data.loggedBy };
    if (_isConfigured) {
      try { await db.collection('interventions').add(entry); } catch(e) { return { data: null, error: e }; }
    } else {
      const list = _store.getInterventions(); list.unshift({ id: 'i-' + Date.now(), ...entry }); _store.saveInterventions(list);
    }
    return { data: null, error: null };
  }
};

// ── SMS HELPERS (Semaphore API, via server/server.js) ────────
// Note: SMS has no "subject" — subject is prepended to the message body
// (as a bold-ish header line) so existing composer UI / templates still work.
const SMS = {
  serverOnline: null,
  _headers() { const h = { 'Content-Type': 'application/json' }; if (SMS_SERVER_API_KEY) h['X-API-Key'] = SMS_SERVER_API_KEY; return h; },
  _compose(subject, message) { return subject ? `${subject}\n\n${message}` : message; },
  async checkServer() {
    // 20s, not 3s: Render's free tier sleeps after ~15min idle and takes
    // 30-60s to wake on the first request. A short timeout here was
    // misreading a waking-up server as "offline" and silently routing
    // real messages into demo mode instead of actually sending them.
    try { const res = await fetch(`${SMS_SERVER_URL}/health`, { signal: AbortSignal.timeout(20000) }); this.serverOnline = res.ok; return res.ok; }
    catch { this.serverOnline = false; return false; }
  },
  async send(to, toName, subject, message, type = 'advisory', sentBy = '', barangay = null) {
    // Always re-check — don't trust cached serverOnline state
    const online = await this.checkServer();
    const recipientLabel = toName ? `${toName} (${to})` : to;
    if (!online) {
      console.warn('[DengueAlert] SMS.send: server offline, skipping:', to);
      await DB.logSms({ type, subject, to: `${recipientLabel} — demo (server offline)`, count: 1, sentBy, barangay });
      return { success: false, demo: true, error: 'SMS server offline' };
    }
    try {
      const res  = await fetch(`${SMS_SERVER_URL}/send`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ to, message: this._compose(subject, message) }),
        signal: AbortSignal.timeout(30000)
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('[DengueAlert] SMS.send error:', data.error);
        throw new Error(data.error);
      }
      console.log('[DengueAlert] SMS.send OK →', to);
      await DB.logSms({ type, subject, to: recipientLabel, count: 1, sentBy, barangay });
      return { success: true, messageId: data.messageId };
    } catch (err) {
      console.error('[DengueAlert] SMS.send failed →', to, err.message);
      return { success: false, error: err.message };
    }
  },
  async sendBulk(recipients, subject, message, type = 'advisory', sentBy = '') {
    // Always re-check server status — it may have come online after page load
    const online = await this.checkServer();
    if (!online) {
      console.warn('[DengueAlert] SMS server offline — logging as demo');
      await DB.logSms({ type, subject, to: 'demo (server offline)', count: recipients.length, sentBy });
      return { success: false, demo: true, sent: 0, failed: recipients.length };
    }
    try {
      // 30s timeout — parallel sends are fast, this is more than enough
      const res  = await fetch(`${SMS_SERVER_URL}/send-bulk`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ recipients, message: this._compose(subject, message), type }),
        signal: AbortSignal.timeout(30000)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server returned error');
      await DB.logSms({ type, subject, to: `${data.sent} of ${recipients.length} recipients`, count: data.sent, sentBy });
      // If nothing actually got through, pull the real reason from the
      // per-recipient results (e.g. "Semaphore API key rejected", "Invalid
      // Philippine mobile number") instead of leaving the UI to show a
      // generic "check the server" message that doesn't say what's wrong.
      let errorMsg;
      if (data.sent === 0 && Array.isArray(data.results)) {
        const firstFailure = data.results.find(r => !r.success);
        errorMsg = firstFailure?.error;
      }
      return { success: true, sent: data.sent, failed: data.failed, error: errorMsg };
    } catch (err) {
      console.error('[DengueAlert] sendBulk failed:', err.message);
      return { success: false, error: err.message, sent: 0, failed: recipients.length };
    }
  },
  async testConnection() {
    try { const res = await fetch(`${SMS_SERVER_URL}/test-connection`, { headers: this._headers(), signal: AbortSignal.timeout(10000) }); const data = await res.json(); return { success: data.success, message: data.message || data.error }; }
    catch (err) { return { success: false, message: 'Cannot reach SMS server: ' + err.message }; }
  }
};

// ── AUTH HELPERS (server-mediated login — see server/server.js) ─────
// The browser never talks to the `admin` / `bhw_accounts` collections
// directly anymore (Firestore rules block that). Instead it calls these
// endpoints, which verify the password server-side and return a Firebase
// custom token carrying the user's role as a claim. Signing in with that
// token is what lets Firestore rules recognize the user for every other
// collection (dengue_cases, sms_logs, interventions).
const AUTH = {
  async _post(path, body) {
    const res  = await fetch(`${SMS_SERVER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async login(role, username, password, barangay) {
    const data = await this._post('/login', { role, username, password, barangay });
    if (_isConfigured && auth) await auth.signInWithCustomToken(data.token);
    return data.user;
  },
  register(payload) { return this._post('/register', payload); },
  findAccountForReset(email) { return this._post('/forgot-password/find', { email }); },
  resetPassword(accountId, newPassword) { return this._post('/forgot-password/reset', { accountId, newPassword }); }
};

// ── SESSION HELPERS ──────────────────────────────────────────
const SESSION = {
  get()    { try { return JSON.parse(localStorage.getItem('dengue_user') || 'null'); } catch { return null; } },
  require(role = null) {
    const user = this.get();
    if (!user) { window.location.href = 'index.html'; return null; }
    // Normalize legacy 'barangay' role value to 'bhw'
    if (user.role === 'barangay') { user.role = 'bhw'; localStorage.setItem('dengue_user', JSON.stringify(user)); }
    // Normalize role check: 'barangay' passed as argument means 'bhw'
    const requiredRole = role === 'barangay' ? 'bhw' : role;
    if (requiredRole && user.role !== requiredRole && !(requiredRole === 'rhu' && user.role === 'admin')) {
      window.location.href = 'index.html'; return null;
    }
    return user;
  },
  logout() {
    localStorage.removeItem('dengue_user');
    if (_isConfigured && auth) auth.signOut().catch(() => {});
    window.location.href = 'index.html';
  }
};

// Check SMS server on every page load
document.addEventListener('DOMContentLoaded', () => SMS.checkServer());

// ── FIRESTORE RULES ───────────────────────────────────────────
// See firestore.rules in the project root — deploy it via Firebase
// Console → Firestore Database → Rules. Registration/login now go
// through server.js (Admin SDK), so the browser no longer needs direct
// write access to `admin` or `bhw_accounts`.
