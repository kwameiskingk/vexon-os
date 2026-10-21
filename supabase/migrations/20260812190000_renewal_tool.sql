-- Stage 3: Renewal ROI tool — persistence + presentation snapshots.
--
-- Two tables:
--   renewal_manual_fields  — the MANUAL figures Daniel types (vacancies,
--     placement fee, campaign investment, ongoing monthly, goals 1–3), one
--     row per (client, field), long format like the Stage 2 overrides so
--     every field carries its own edited_by/edited_at for the "last edited
--     N days ago" marker. AUTO fields (booked, sat, show-up, campaign
--     period, client name) are never stored here — they refresh live each
--     time the tab opens. Nothing here writes back to client health.
--   renewal_presentations  — immutable snapshot written when present mode
--     is entered: every displayed figure, the scenario toggle position,
--     timestamp and presenter. Append-only via RLS (no UPDATE/DELETE
--     policies), so September's edits can never rewrite August's
--     presentation.
--
-- Keying decision: per CLIENT, not per campaigns-table row — campaign rows
-- and dates are unreliably populated (Stage 0 audit Q16: 2/42 start dates,
-- 0 end dates), and Daniel's cadence is "same client, update what moved".
-- Cross-campaign history is preserved by the presentation snapshots.

CREATE TABLE IF NOT EXISTS public.renewal_manual_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN (
    'vacancies', 'placement_fee', 'campaign_investment',
    'monthly_investment', 'goal1', 'goal2', 'goal3'
  )),
  value_numeric numeric,
  value_text text,
  edited_by uuid NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_profile_id, field),
  CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
);

COMMENT ON TABLE public.renewal_manual_fields IS
  'Persisted manual figures for the Renewal tab, one row per (client, field). Numeric fields use value_numeric; goal answers use value_text. edited_at drives the staleness marker. Independent of client health — never written back.';

CREATE INDEX IF NOT EXISTS idx_renewal_manual_fields_client
  ON public.renewal_manual_fields (client_profile_id);

ALTER TABLE public.renewal_manual_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view renewal fields" ON public.renewal_manual_fields;
CREATE POLICY "Staff can view renewal fields"
  ON public.renewal_manual_fields FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
  );

DROP POLICY IF EXISTS "Staff can insert renewal fields" ON public.renewal_manual_fields;
CREATE POLICY "Staff can insert renewal fields"
  ON public.renewal_manual_fields FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
  );

DROP POLICY IF EXISTS "Staff can update renewal fields" ON public.renewal_manual_fields;
CREATE POLICY "Staff can update renewal fields"
  ON public.renewal_manual_fields FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
  );

DROP POLICY IF EXISTS "Staff can delete renewal fields" ON public.renewal_manual_fields;
CREATE POLICY "Staff can delete renewal fields"
  ON public.renewal_manual_fields FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
  );

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.renewal_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  presented_by uuid NOT NULL,
  presented_at timestamptz NOT NULL DEFAULT now(),
  scenario text NOT NULL CHECK (scenario IN ('low', 'expected', 'high')),
  -- Everything that was on screen when present mode was entered: inputs,
  -- all three computed columns, and display strings. Written once, never
  -- updated — RLS has no UPDATE/DELETE policies on this table.
  figures jsonb NOT NULL
);

COMMENT ON TABLE public.renewal_presentations IS
  'Immutable record of each renewal presentation: exact figures shown, scenario toggle position, presenter, timestamp. Append-only by design — later edits must never rewrite a past presentation.';

CREATE INDEX IF NOT EXISTS idx_renewal_presentations_client
  ON public.renewal_presentations (client_profile_id, presented_at DESC);

ALTER TABLE public.renewal_presentations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view renewal presentations" ON public.renewal_presentations;
CREATE POLICY "Staff can view renewal presentations"
  ON public.renewal_presentations FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
  );

DROP POLICY IF EXISTS "Staff can insert renewal presentations" ON public.renewal_presentations;
CREATE POLICY "Staff can insert renewal presentations"
  ON public.renewal_presentations FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
  );

-- Deliberately NO UPDATE or DELETE policies on renewal_presentations:
-- snapshots are immutable through the app for every role.
