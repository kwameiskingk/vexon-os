-- RECORD-KEEPING MIGRATION — ALREADY APPLIED TO THE LIVE DB (2026-07-28,
-- run manually by the owner in the hosted SQL editor; approved 2026-07-23).
-- Committed so migration history matches the live schema. Every statement
-- is idempotent, so accidentally re-running it is a no-op.
--
-- AE Close linkage step 1:
-- 1. 'sales' added to the setters_profiles department CHECK. AEs get a
--    setters_profiles row purely to key Close telemetry (close_user_id →
--    setter_close_metrics); department 'sales' keeps these rows out of every
--    setter surface that filters on fulfilment/acquisition.
-- 2. Data fix: AE-only profile rows (account_executive role, no setter
--    role) moved out of setter departments — Oliver Grant fulfilment→sales.
-- 3. Rory Carter's AE profile row created (department 'sales', guarded).

-- Drop the existing department CHECK by catalog lookup (constraint may not
-- carry the assumed name; a name-based drop could silently stack).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.setters_profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%department%'
  LOOP
    EXECUTE format('ALTER TABLE public.setters_profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.setters_profiles
  ADD CONSTRAINT setters_profiles_department_check
  CHECK (department IN ('fulfilment', 'acquisition', 'hr', 'sales'));

-- Data fix: AE-only profile rows out of setter departments.
UPDATE public.setters_profiles sp
SET department = 'sales'
WHERE sp.department IN ('fulfilment', 'acquisition')
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = sp.user_id AND ur.role = 'account_executive'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = sp.user_id AND ur.role = 'setter'
  );

-- Rory Carter's AE profile row (telemetry keying only; guarded, idempotent).
INSERT INTO public.setters_profiles (user_id, email, full_name, department, active, is_test_account)
SELECT 'cfd78996-a3c9-461a-8756-bdc70ede5203',
       'rory@meridiansales.example',
       'Rory Carter',
       'sales',
       true,
       false
WHERE NOT EXISTS (
  SELECT 1 FROM public.setters_profiles
  WHERE user_id = 'cfd78996-a3c9-461a-8756-bdc70ede5203'
);
