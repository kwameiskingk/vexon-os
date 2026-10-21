-- CSM catch-up feedback capture (Batch 2B):
--  1. client_catchups feedback columns (vacancies / potential revenue / opportunities)
--  2. client_health_opening_balances (one-time sheet import, keeps continuity
--     of the CEO vacancy/revenue tiles when they switch off the Google Sheet)
--  3. client_profiles.campaign_end_date (native home for the sheet's
--     "Campaign End Date" — prerequisite for the native client-health rollup)

-- ── 1. client_catchups feedback fields ──────────────────────────────────────
-- All three are point-in-time snapshots, not increments. vacancies_open and
-- opportunities = "currently open at this client". potential_revenue_total =
-- the client's running total to date — the CSM types the same cumulative
-- figure the sheet cell held. Aggregation takes the LATEST value per client
-- and never sums entries (summing a habitually-cumulative figure would
-- silently over-count).
ALTER TABLE public.client_catchups
  ADD COLUMN IF NOT EXISTS vacancies_open integer,
  ADD COLUMN IF NOT EXISTS potential_revenue_total numeric,
  ADD COLUMN IF NOT EXISTS opportunities integer;

-- ── 2. client_health_opening_balances ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_health_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL UNIQUE REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  vacancies integer,
  potential_revenue numeric,
  opportunities integer,
  source text NOT NULL DEFAULT 'sheet_import',
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid
);

ALTER TABLE public.client_health_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view opening balances"
ON public.client_health_opening_balances FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
  OR public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'sdr_manager')
);

CREATE POLICY "Admins manage opening balances"
ON public.client_health_opening_balances FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
);

-- ── 3. client_profiles.campaign_end_date ────────────────────────────────────
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS campaign_end_date date;
