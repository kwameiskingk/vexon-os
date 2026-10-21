-- Department-head goals — CEO accountability log, approved 2026-07-30.
-- Marcus sets daily/weekly goals FOR each department head on the CEO
-- dashboard and marks outcomes (hit / missed / exceeded) end of day.
--
-- ⚠️  This is a FOURTH, UNRELATED goal concept. It must NEVER be read by:
--   • resolveTargets.ts / role_target_defaults / individual_targets
--     (standing per-setter targets that drive RAG),
--   • setter_weekly_goals (Nadia's Morning-Meeting weekly Booked/SAT,
--     overlaid in useFulfilmentRag only),
--   • setter_period_notes or any review engine.
-- It is a standalone CEO log rendered only on /admin/ceo/* surfaces.
--
-- RLS scope (2026-07-30 ruling): admin + dev read AND write only.
-- There is no 'ceo' value in app_role — the CEO (Marcus) holds 'admin'.
-- Precedents considered: ceo_initiatives (Marcus-UUID-bound; legacy
-- pattern per src/lib/ceo.ts) and performance_goals (can_manage_goals
-- capability, currently seeded to admin+dev roles with no user grants).
-- Explicit has_role(admin|dev) chosen over the capability because
-- capabilities are data-editable and shared across surfaces — a later
-- grant for another feature must not silently open this log.
-- 'ops' is deliberately EXCLUDED from the usual admin/dev/ops tier:
-- Elena (ops) is a department head, i.e. a SUBJECT of this table, and
-- heads do not get read access yet (Marcus screen-shares to them).
-- FUTURE EXTENSION (not built): per-head SELECT via
-- subject_user_id = auth.uid() when heads get their own view.
--
-- Multiple goals per head per period are a requirement — deliberately NO
-- unique constraint on (subject_user_id, period_start); order by created_at.
--
-- NOTE: to be applied via the hosted builder SQL editor; migration bookkeeping unaware.
--       Never `supabase db push` this file. Add to the repair list:
--       supabase migration repair --status applied 20260730060000

CREATE TABLE public.department_head_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id uuid NOT NULL,          -- the department head the goal is FOR
  department text NOT NULL,               -- which CEO tab it renders on
  period_type text NOT NULL,
  period_start date NOT NULL,             -- the day (daily) or Monday (weekly)
  goal_type text NOT NULL,                -- preset dropdown value, or 'custom'
  goal_label text,                        -- free text; required when custom
  target_value numeric,                   -- optional number
  outcome text,                           -- null until Marcus marks it
  miss_reason text,                       -- the "why" box, used when missed
  created_by uuid NOT NULL,
  outcome_marked_by uuid,
  outcome_marked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dhg_period_type CHECK (period_type IN ('daily','weekly')),
  CONSTRAINT dhg_department CHECK (department IN ('sales','fulfilment','hr','client_health')),
  CONSTRAINT dhg_outcome CHECK (outcome IS NULL OR outcome IN ('hit','missed','exceeded')),
  CONSTRAINT dhg_custom_needs_label CHECK (goal_type <> 'custom' OR (goal_label IS NOT NULL AND length(trim(goal_label)) > 0)),
  CONSTRAINT dhg_missed_needs_reason CHECK (outcome IS DISTINCT FROM 'missed' OR (miss_reason IS NOT NULL AND length(trim(miss_reason)) > 0))
);

CREATE INDEX idx_dhg_subject_period ON public.department_head_goals (subject_user_id, period_start);
CREATE INDEX idx_dhg_department_period ON public.department_head_goals (department, period_type, period_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_head_goals TO authenticated;
GRANT ALL ON public.department_head_goals TO service_role;

ALTER TABLE public.department_head_goals ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_department_head_goals_updated_at
  BEFORE UPDATE ON public.department_head_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admin and dev manage department head goals"
  ON public.department_head_goals
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  );

-- Department heads deliberately have NO policy on this table yet (see header).
