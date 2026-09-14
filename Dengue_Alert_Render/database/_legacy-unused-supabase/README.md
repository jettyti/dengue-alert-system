# Not used — legacy Supabase schema

These two files (`schema.sql`, `fix_rls.sql`) describe a Postgres/Supabase
database with `auth.uid()`-based Row Level Security policies. The live
app does **not** use Supabase — it runs on Firebase Firestore (see
`config.js` and `firestore.rules` in the project root), with a
localStorage fallback when Firebase isn't configured.

Kept here only for historical reference. Safe to delete. Do not run
these against a live project expecting them to have any effect on the
current app — they aren't wired to anything.
