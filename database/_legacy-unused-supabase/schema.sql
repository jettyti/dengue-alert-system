-- ============================================================
--  DENGUE ALERT SYSTEM — Supabase Database Schema
--  Municipality of Janiuay, Iloilo
--
--  HOW TO USE:
--  1. Go to your Supabase project → SQL Editor
--  2. Paste this entire file and click "Run"
--  3. All tables, indexes, and sample data will be created
-- ============================================================


-- ── USERS TABLE ──────────────────────────────────────────────
-- Extends Supabase auth.users with profile info
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  username    TEXT UNIQUE,
  role        TEXT NOT NULL CHECK (role IN ('barangay', 'rhu', 'admin')),
  barangay    TEXT,              -- Only for barangay workers
  email       TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "RHU can read all users"
  ON public.users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('rhu', 'admin')
    )
  );


-- ── DENGUE CASES TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dengue_cases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Patient info
  patient_name     TEXT NOT NULL,
  patient_age      INT,
  patient_sex      TEXT CHECK (patient_sex IN ('Male', 'Female', 'Other')),
  patient_address  TEXT,
  patient_contact  TEXT,
  -- Case info
  barangay         TEXT NOT NULL,
  onset_date       DATE NOT NULL,
  report_date      TIMESTAMPTZ DEFAULT NOW(),
  severity         TEXT NOT NULL CHECK (severity IN ('Mild', 'Moderate', 'Severe')),
  symptoms         TEXT[],          -- Array: ['Fever','Rash','Headache',...]
  status           TEXT NOT NULL DEFAULT 'Pending'
                   CHECK (status IN ('Pending', 'Confirmed', 'Rejected', 'Recovered', 'Hospitalized')),
  -- Metadata
  submitted_by     UUID REFERENCES public.users(id),
  notes            TEXT,
  rhu_notes        TEXT,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cases_barangay     ON public.dengue_cases (barangay);
CREATE INDEX IF NOT EXISTS idx_cases_onset_date   ON public.dengue_cases (onset_date);
CREATE INDEX IF NOT EXISTS idx_cases_status       ON public.dengue_cases (status);
CREATE INDEX IF NOT EXISTS idx_cases_report_date  ON public.dengue_cases (report_date DESC);

-- Enable RLS
ALTER TABLE public.dengue_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Barangay workers can insert cases"
  ON public.dengue_cases FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Barangay workers can read own barangay cases"
  ON public.dengue_cases FOR SELECT
  USING (
    submitted_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND (u.barangay = dengue_cases.barangay OR u.role IN ('rhu', 'admin'))
    )
  );

CREATE POLICY "RHU can update cases"
  ON public.dengue_cases FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('rhu', 'admin')
    )
  );


-- ── SMS LOGS TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type             TEXT NOT NULL,   -- 'prevention', 'warning', 'fogging', etc.
  subject          TEXT NOT NULL,
  recipient_to     TEXT,            -- 'All', specific mobile number, or 'High-Risk Only'
  recipient_count  INT DEFAULT 1,
  barangay         TEXT DEFAULT 'All',
  sent_by          UUID REFERENCES public.users(id),
  sent_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_sent_at ON public.sms_logs (sent_at DESC);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can log SMS"
  ON public.sms_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "RHU and barangay can read SMS logs"
  ON public.sms_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ── INTERVENTIONS TABLE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interventions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,   -- 'Fogging', 'Cleanup Drive', 'Household Visit', 'Larvicide'
  barangay    TEXT NOT NULL,
  date        DATE NOT NULL,
  description TEXT,
  logged_by   UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interventions_barangay ON public.interventions (barangay);
CREATE INDEX IF NOT EXISTS idx_interventions_date     ON public.interventions (date DESC);

ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can log interventions"
  ON public.interventions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "All authenticated users can view interventions"
  ON public.interventions FOR SELECT USING (auth.uid() IS NOT NULL);


-- ── REALTIME SUBSCRIPTIONS ───────────────────────────────────
-- Enable Realtime for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.dengue_cases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.interventions;


-- ── HELPER VIEWS ─────────────────────────────────────────────

-- Barangay risk summary (cases in last 14 days, confirmed only)
CREATE OR REPLACE VIEW public.barangay_risk_summary AS
SELECT
  barangay,
  COUNT(*) FILTER (WHERE status = 'Confirmed' AND onset_date >= CURRENT_DATE - INTERVAL '14 days') AS cases_14d,
  COUNT(*) FILTER (WHERE status = 'Confirmed') AS total_confirmed,
  COUNT(*) FILTER (WHERE status = 'Pending')   AS pending,
  MAX(onset_date) AS last_case_date,
  CASE
    WHEN COUNT(*) FILTER (WHERE status = 'Confirmed' AND onset_date >= CURRENT_DATE - INTERVAL '14 days') >= 5 THEN 'High'
    WHEN COUNT(*) FILTER (WHERE status = 'Confirmed' AND onset_date >= CURRENT_DATE - INTERVAL '14 days') >= 3 THEN 'Medium'
    ELSE 'Low'
  END AS risk_level
FROM public.dengue_cases
GROUP BY barangay
ORDER BY cases_14d DESC;


-- ── SAMPLE DATA (for testing) ────────────────────────────────
-- NOTE: In production, create real users via Supabase Auth dashboard
-- then insert profiles into the users table manually.

-- Sample confirmed cases for demonstration
-- (These won't have submitted_by since we don't have real auth UUIDs yet)
INSERT INTO public.dengue_cases
  (patient_name, patient_age, patient_sex, patient_address, patient_contact, barangay, onset_date, severity, symptoms, status, notes)
VALUES
  ('Juan dela Cruz',    32, 'Male',   'Purok 3, Poblacion',      '09171234501',   'Poblacion',   '2025-11-25', 'Severe',   ARRAY['Fever','Rash','Headache','Vomiting'],     'Confirmed', 'Hospitalized at RHU'),
  ('Maria Santos',      28, 'Female', 'Purok 1, Sta. Barbara',   '09171234502',  'Sta. Barbara','2025-11-27', 'Moderate', ARRAY['Fever','Rash','Body Aches'],              'Confirmed', NULL),
  ('Pedro Reyes',       45, 'Male',   'Sitio Masag, San Isidro', '09171234503',  'San Isidro',  '2025-11-28', 'Moderate', ARRAY['Fever','Headache'],                       'Confirmed', NULL),
  ('Ana Gonzales',      19, 'Female', 'Purok 2, Poblacion',      '09171234504',    'Poblacion',   '2025-11-29', 'Severe',   ARRAY['Fever','Rash','Vomiting','Nosebleed'],    'Confirmed', NULL),
  ('Carlos Torres',     55, 'Male',   'Purok 4, Cagay',          '09171234505', 'Cagay',       '2025-11-30', 'Mild',     ARRAY['Fever','Body Aches'],                     'Confirmed', NULL),
  ('Luisa Flores',      38, 'Female', 'Purok 1, Poblacion',      '09171234506',  'Poblacion',   '2025-12-01', 'Moderate', ARRAY['Fever','Rash','Headache'],                'Confirmed', NULL),
  ('Ramon Cruz',        62, 'Male',   'Purok 2, Sta. Barbara',   NULL,                 'Sta. Barbara','2025-12-01', 'Severe',   ARRAY['Fever','Rash','Vomiting','Joint Aches'],  'Confirmed', NULL),
  ('Elena Bautista',    24, 'Female', 'Purok 5, San Isidro',     '09171234507',  'San Isidro',  '2025-12-02', 'Mild',     ARRAY['Fever','Headache'],                       'Pending',   NULL),
  ('Jose Villanueva',   31, 'Male',   'Purok 3, Bolhog',         '09171234508',   'Bolhog',      '2025-12-02', 'Moderate', ARRAY['Fever','Rash'],                           'Confirmed', NULL),
  ('Luz Ramirez',       47, 'Female', 'Purok 1, Daguitan',       NULL,                 'Daguitan',    '2025-12-03', 'Mild',     ARRAY['Fever','Body Aches'],                     'Confirmed', NULL),
  ('Miguel Hernandez',  29, 'Male',   'Purok 2, Poblacion',      '09171234509', 'Poblacion',   '2025-12-03', 'Moderate', ARRAY['Fever','Rash','Joint Aches'],             'Confirmed', NULL),
  ('Rosa Mendoza',      16, 'Female', 'Purok 3, Sta. Barbara',   '09171234510',   'Sta. Barbara','2025-12-04', 'Moderate', ARRAY['Fever','Rash','Headache','Body Aches'],   'Pending',   NULL),
  ('Antonio Lim',       41, 'Male',   'Purok 1, San Isidro',     '09171234511','San Isidro',  '2025-12-04', 'Mild',     ARRAY['Fever'],                                  'Pending',   NULL);


-- ============================================================
--  AFTER RUNNING THIS:
--  1. Go to Supabase Auth → Users → Add User
--  2. Create: admin@rhu.janiuay.gov.ph (role: admin)
--  3. Create: bhw@poblacion (role: barangay)
--  4. Then insert into public.users table:
--     INSERT INTO public.users (id, name, role, barangay)
--     VALUES ('<uuid-from-auth>', 'Dr. R. Hernandez', 'rhu', NULL);
-- ============================================================
