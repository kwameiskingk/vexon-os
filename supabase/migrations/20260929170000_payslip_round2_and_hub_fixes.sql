-- Payslips round two + Employee Hub fixes (29 Sep 2026, Elena's review call).
-- Safe to run twice. No RLS change.
--
-- 1. Employee Hub: the Department dropdown offers Operations and Accounting
--    but the CHECK only allowed four values, so Elena's change to
--    "Operations" was rejected silently and the header kept saying
--    Fulfilment. Widen the CHECK to what the form offers.
-- 2. Job title lives on the profile (every staff member has one, not only
--    setters). The payslip designation reads it first.
-- 3. Leave allowance per employee (days per year, Elena maintains it);
--    the payslip shows allowance minus approved holiday taken this year.
-- 4. Payslips record the days worked and leave balance printed on the slip.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'setters_profiles_department_check'
  ) THEN
    ALTER TABLE public.setters_profiles DROP CONSTRAINT setters_profiles_department_check;
  END IF;
  ALTER TABLE public.setters_profiles
    ADD CONSTRAINT setters_profiles_department_check
    CHECK (department IN ('fulfilment', 'acquisition', 'sales', 'operations', 'hr', 'accounting'));
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS leave_allowance_days numeric(5,1);

ALTER TABLE public.employee_payslips
  ADD COLUMN IF NOT EXISTS days_worked   numeric(5,1),
  ADD COLUMN IF NOT EXISTS leave_balance numeric(5,1);

-- Verification
SELECT
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'setters_profiles_department_check') AS department_check,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'profiles' AND column_name IN ('job_title','leave_allowance_days')) AS profile_cols,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'employee_payslips' AND column_name IN ('days_worked','leave_balance')) AS payslip_cols;
