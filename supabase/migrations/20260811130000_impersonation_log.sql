-- Dev impersonation audit trail.
--
-- Replaces the "shared dev master password" idea with identity-based
-- impersonation: a dev mints a real, short-lived session as a target user
-- via the `impersonate-user` edge function. Every such action is recorded
-- here so impersonation is always attributable to a specific dev.
--
-- Written to be idempotent (safe to re-run) so it can be applied either by
-- hand in the SQL editor or automatically on merge without conflicting.

CREATE TABLE IF NOT EXISTS public.impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impersonator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  impersonator_email text,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.impersonation_log TO authenticated;
GRANT ALL ON public.impersonation_log TO service_role;

ALTER TABLE public.impersonation_log ENABLE ROW LEVEL SECURITY;

-- Only devs may read the impersonation trail. Rows are written exclusively
-- by the edge function using the service-role key, which bypasses RLS, so no
-- INSERT policy is granted to authenticated users.
DROP POLICY IF EXISTS "Devs can read impersonation log" ON public.impersonation_log;
CREATE POLICY "Devs can read impersonation log"
  ON public.impersonation_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dev'));

CREATE INDEX IF NOT EXISTS idx_impersonation_log_created_at
  ON public.impersonation_log (created_at DESC);
