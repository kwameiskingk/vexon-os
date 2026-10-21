-- ============================================================
-- Platform-wide employee offboarding flag + leaver backfill
-- File: supabase/migrations/20260825140000_platform_offboarding_flag.sql
-- Idempotent: safe to run by hand in the hosted SQL editor and again on merge.
-- Retains ALL data — this adds a flag, deletes nothing, strips no roles.
-- ============================================================

-- 1. The flag. NULL = current employee; a timestamp = former employee
--    (doubles as the leaving date for review/insight surfaces).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS offboarded_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.profiles.offboarded_at IS
  'Set when the person is offboarded: hidden from all live rosters/pickers; history retained and shown under former-employee filters.';

CREATE INDEX IF NOT EXISTS idx_profiles_offboarded_at
  ON public.profiles (offboarded_at)
  WHERE offboarded_at IS NOT NULL;

-- 2. Backfill the 14 known genuine leavers (verified against live
--    employee_offboarding records, setters_profiles.active=false rows, and
--    migration 20260811120000). Dates = completed offboarding record where one
--    exists, else 2026-08-11 (leaver-visibility data-fix date).
--    Test accounts (Taylor Test, Jonas Berg, Theo Adebayo, Ethan
--    Imperatore) are deliberately NOT flagged — is_test_account covers them.
UPDATE public.profiles p
SET offboarded_at = v.left_on
FROM (VALUES
  ('84ebff0c-4cf3-484f-8ec2-58397f91c39f'::uuid, timestamptz '2026-08-13'), -- Amna Naqvi (ops_assistant)
  ('b358da40-2baa-4d57-8fb9-8c6a24200053'::uuid, timestamptz '2026-07-27'), -- Chloe Dubois (setter)
  ('0485656e-cb03-47ef-813e-b078b5461b2e'::uuid, timestamptz '2026-08-19'), -- Mia Jansen (setter)
  ('0fad9ce6-6a82-4e08-8023-7e48a8b0d63e'::uuid, timestamptz '2026-08-11'), -- Caleb Moss (setter, legacy leaver, no offboarding record)
  ('8b943864-7b1a-44d8-8669-8d055b3bfcf4'::uuid, timestamptz '2026-08-03'), -- Jonah Price (setter)
  ('60eab4df-dd21-4801-8be7-2b1fbf6313ae'::uuid, timestamptz '2026-08-11'), -- Leo Marsh (setter, legacy leaver, no offboarding record)
  ('24bd149b-b6fd-40f6-8398-c5878f125d71'::uuid, timestamptz '2026-07-22'), -- Matthew Blake (setter)
  ('c64a52c9-4e87-489f-86d5-a591ddb38312'::uuid, timestamptz '2026-08-24'), -- Mduduzi Kupe (setter)
  ('ba895f9c-398f-4906-82e4-185f00fdaaa3'::uuid, timestamptz '2026-08-11'), -- Nikita Rachman (setter, inactive, no offboarding record)
  ('3e879847-ed83-4a9b-805b-c60784851ed8'::uuid, timestamptz '2026-07-27'), -- Nikkita Kleynhans (setter)
  ('afdfa192-ec6a-4826-8141-39130ed6d195'::uuid, timestamptz '2026-08-25'), -- Luis Ferreira (setter)
  ('d679dbd5-621f-44c0-8bca-4c68e8f4e8a7'::uuid, timestamptz '2026-07-22'), -- Saadiq''h Van Oudtshoorn (setter)
  ('c85cb676-8671-412e-85f8-11736fa3c123'::uuid, timestamptz '2026-08-06'), -- Ravi Menon (setter)
  ('a2ec0f73-0efa-44ed-8910-f679eb0b7796'::uuid, timestamptz '2026-08-11')  -- Felix Brandt (sdr_manager)
) AS v(user_id, left_on)
WHERE p.id = v.user_id
  AND p.offboarded_at IS NULL;

-- 3. Setter-bench flag safety net (all 12 leaver setter rows are already
--    active=false in prod as of 25 Aug; this guards against drift and future
--    hand-run reordering).
UPDATE public.setters_profiles sp
SET active = false
FROM public.profiles p
WHERE sp.user_id = p.id
  AND p.offboarded_at IS NOT NULL
  AND sp.active = true;

-- 4. Login backfill: 8 of the 14 were never banned (their offboardings predate
--    employee_user_id, or never went through the edge function). GoTrue reads
--    auth.users.banned_until directly; mirrors the edge fn's ~100-year ban.
--    (Not banned today: Chloe, Caleb Moss, Jonah Price, Leo Marsh,
--    Matthew Blake, Nikita Rachman, Nikkita Kleynhans, Saadiq'h.)
UPDATE auth.users u
SET banned_until = now() + interval '100 years'
FROM public.profiles p
WHERE u.id = p.id
  AND p.offboarded_at IS NOT NULL
  AND (u.banned_until IS NULL OR u.banned_until < now());

-- Deliberately NOT done:
--   * No user_roles stripping — leaver history visibility (RLS in migration
--     20260811120000) and role-keyed history joins depend on role rows.
--   * No employee_offboarding row deletion/normalisation — kept as history log
--     (duplicates flagged as an open question).
--   * No table drops — employee_offboarding_tasks kept, just unused by the new UI.
