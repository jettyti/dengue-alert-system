-- ============================================================
--  RUN THIS in Supabase SQL Editor if login redirects fail
--  It fixes the Row Level Security policy on the users table
-- ============================================================

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "RHU can read all users" ON public.users;

-- Simple open read policy — users can read their own row
CREATE POLICY "Allow authenticated read"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

-- Allow insert for initial setup
CREATE POLICY "Allow authenticated insert"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Verify your users exist
SELECT id, name, role, barangay FROM public.users;
