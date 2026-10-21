-- Trial Day (18 Sep 2026, the owner): trialists must never see real client names.
-- Elena (or a dev) picks which clients a trialist dials for on the candidate
-- card; the trialist sees them as "Client A", "Client B", … in the order
-- picked. Staff surfaces (CSM review, TA card) keep the real name.

-- 1. Which clients each trialist dials for (ordered).
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS trial_client_ids uuid[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.candidates.trial_client_ids IS
  'client_profiles ids the trialist dials for, in alias order (index 0 = Client A). Empty = every active client, still aliased.';

-- 2. What the trialist may pick: their assigned clients, aliased. Same
--    function name as before so nothing else changes; the column is now
--    `label` and the real name is never returned to a trialist.
DROP FUNCTION IF EXISTS public.trial_active_clients();
CREATE OR REPLACE FUNCTION public.trial_active_clients()
RETURNS TABLE (id uuid, label text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT c.trial_client_ids
    FROM public.candidates c
    WHERE c.trialist_user_id = auth.uid()
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT 1
  ),
  picked AS (
    SELECT cp.id, ord.n
    FROM me, unnest(me.trial_client_ids) WITH ORDINALITY AS ord(cid, n)
    JOIN public.client_profiles cp ON cp.id = ord.cid
    WHERE cp.status = 'active'
  ),
  fallback AS (
    SELECT cp.id, row_number() OVER (ORDER BY cp.company_name) AS n
    FROM public.client_profiles cp
    WHERE cp.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM picked)
  ),
  ordered AS (
    SELECT id, n FROM picked
    UNION ALL
    SELECT id, n FROM fallback
  )
  SELECT o.id, 'Client ' || chr(64 + o.n::int) AS label
  FROM ordered o
  WHERE auth.uid() IS NOT NULL
  ORDER BY o.n;
$$;
GRANT EXECUTE ON FUNCTION public.trial_active_clients() TO authenticated;

-- 3. What staff may assign from: active clients by real name. Reviewer roles
--    only (same set as the trial_leads reviewer policy), so Elena can pick
--    without a client_profiles policy of her own.
CREATE OR REPLACE FUNCTION public.trial_assignable_clients()
RETURNS TABLE (id uuid, company_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.id, cp.company_name
  FROM public.client_profiles cp
  WHERE cp.status = 'active'
    AND (
      public.has_role(auth.uid(), 'csm'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'dev'::public.app_role)
      OR public.has_role(auth.uid(), 'ops'::public.app_role)
      OR public.has_role(auth.uid(), 'hr'::public.app_role)
      OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
      OR public.has_capability(auth.uid(), 'can_screen_candidates')
    )
  ORDER BY cp.company_name;
$$;
GRANT EXECUTE ON FUNCTION public.trial_assignable_clients() TO authenticated;

-- Proof
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='candidates' AND column_name='trial_client_ids') AS column_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='trial_active_clients') AS trialist_fn_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='trial_assignable_clients') AS staff_fn_ok;
