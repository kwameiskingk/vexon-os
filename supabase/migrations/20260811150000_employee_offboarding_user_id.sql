-- HR offboarding must be able to target ANY internal user, not just the
-- setter bench. `employee_profile_id` is FK-locked to setters_profiles, so
-- managers/admins/ops/etc (e.g. Felix Brandt, an sdr_manager) could never
-- be selected. Add a separate nullable `employee_user_id` pointing at the auth
-- user; the offboard-user edge function uses it to actually block the account
-- (ban login) when offboarding is completed.
--
-- Idempotent: safe to run by hand in the hosted SQL editor and again on merge.

ALTER TABLE public.employee_offboarding
  ADD COLUMN IF NOT EXISTS employee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
