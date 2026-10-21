-- Client onboarding pipeline fixes (2026-07-22)
--
-- 1. client_profiles.contract_term: the contract term is captured at close time
--    (Mark as Won) and in the onboarding Add Client form, but until now had no
--    home on the client profile — it only lived on pitch_calls. Text to match
--    pitch_calls.contract_term ('3 months' / '6 months' / '12 months' / free text).
--
-- 2. Drop the duplicate client_profiles -> clients sync trigger. The same
--    function is attached twice (sync_to_clients AND
--    sync_client_profile_to_clients_trigger), so every insert/update runs the
--    legacy-table sync twice. Keep one.
--
-- 3. Let admin-tier roles (admin/dev/ops/finance/csm/account_executive) insert
--    notifications from the app. The only INSERT policy on notifications is
--    TO service_role, so every browser-side notification insert — including
--    the AE "New Deal Closed" notification in MarkAsWonModal, which never
--    checks its error — has been silently failing. Proven by rolled-back
--    impersonation on 2026-07-22 (case 9 of verify-csm-client-lifecycle.sql).
--
-- All statements are idempotent and safe to re-run. No data is modified.

ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS contract_term text;

COMMENT ON COLUMN public.client_profiles.contract_term IS
  'Contract term as agreed at close (e.g. ''6 months''). Mirrors pitch_calls.contract_term for the winning deal; editable on the client profile.';

DROP TRIGGER IF EXISTS sync_to_clients ON public.client_profiles;

DROP POLICY IF EXISTS "Admin roles can insert notifications" ON public.notifications;
CREATE POLICY "Admin roles can insert notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_role(auth.uid()));
