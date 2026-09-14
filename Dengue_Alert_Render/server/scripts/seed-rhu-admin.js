/**
 * One-time helper to create the first RHU login account.
 * (BHWs can self-register from index.html; RHU/admin accounts can't be
 * self-registered on purpose, so the first one has to be seeded here.)
 *
 * Usage (from the server/ folder, after FIREBASE_SERVICE_ACCOUNT_PATH
 * is set in .env and the key file is in place):
 *
 *   node scripts/seed-rhu-admin.js "Dr. Jane Dela Cruz" rhu@janiuay.gov.ph "a-strong-password"
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path  = require('path');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password) {
    console.error('Usage: node scripts/seed-rhu-admin.js "<name>" "<email>" "<password>"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? path.resolve(__dirname, '..', process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : null;
  if (!saPath || !require('fs').existsSync(saPath)) {
    console.error('FIREBASE_SERVICE_ACCOUNT_PATH is not set or the file does not exist. See SECURITY_SETUP.md.');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  const db = admin.firestore();

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.collection('admin').where('email', '==', normalizedEmail).get();
  if (!existing.empty) {
    console.error(`An RHU account with email ${normalizedEmail} already exists (doc id: ${existing.docs[0].id}).`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const ref = await db.collection('admin').add({
    name, email: normalizedEmail, passwordHash,
    role: 'rhu', status: 'approved',
    created_at: new Date().toISOString()
  });

  console.log(`✅ RHU account created (doc id: ${ref.id}). You can now log in at the RHU portal with:`);
  console.log(`   Email:    ${normalizedEmail}`);
  console.log(`   Password: (what you typed)`);
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
