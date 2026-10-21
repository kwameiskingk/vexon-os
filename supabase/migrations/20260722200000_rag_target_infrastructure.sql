-- RAG target infrastructure (Phase 1) — 2026-07-22
--
-- Three net-new long-format tables per RAG_TARGETS_STEP1_DESIGN.md:
--   role_target_defaults  — layer 3: the universal minimum per role/department
--   individual_targets    — layer 2: per-person overrides; A ROW EXISTS ONLY
--                           WHEN A HUMAN SET IT (hard principle — nothing is
--                           migrated from the authorless setter_targets backfill)
--   pace_curves           — team-wide weekday shape for expected-to-date
--
-- Resolution precedence (implemented in src/lib/targets/resolveTargets.ts):
--   PIP (stubbed) → individual_targets → [sat only: setter_weekly_goals
--   transition fallback] → role_target_defaults → no target.
--
-- RLS (final, Phase-4): reads for staff; writes for admin/dev/ops plus
-- sdr_manager — scoped to assigned setters on individual_targets
-- (is_sdr_manager_for_setter), to setter-role rows on role_target_defaults,
-- and unscoped on the team-wide pace curve. Proven by rolled-back
-- impersonation before apply. CEO Goals tables (performance_goals,
-- goal_settings) are deliberately untouched.
--
-- Seeds: Nadia-confirmed fulfilment role defaults (FINAL values, mixed grain):
--   booked 1/day · talk 90 min/day · dials 200/day · sat 2/WEEK.
--
-- All statements idempotent; no existing data modified.

CREATE TABLE IF NOT EXISTS public.role_target_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  department text NOT NULL DEFAULT '',
  metric text NOT NULL,
  period text NOT NULL CHECK (period IN ('day','week','month')),
  target_value numeric NOT NULL CHECK (target_value >= 0),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, department, metric, period)
);

CREATE TABLE IF NOT EXISTS public.individual_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_profile_id uuid NOT NULL,
  role text NOT NULL,
  metric text NOT NULL,
  period text NOT NULL CHECK (period IN ('day','week','month')),
  target_value numeric NOT NULL CHECK (target_value >= 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_profile_id, metric, period, effective_from)
);

COMMENT ON TABLE public.individual_targets IS
  'Per-person target overrides. A row exists only when explicitly set by a human (updated_by NOT NULL enforced) — never backfilled. subject_profile_id = setters_profiles.id for setters; other roles use their own profile id when they onboard onto this table.';

CREATE TABLE IF NOT EXISTS public.pace_curves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  period text NOT NULL DEFAULT 'week' CHECK (period IN ('week','month')),
  weights jsonb NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department, period)
);

COMMENT ON COLUMN public.pace_curves.weights IS
  'Weekday shape, e.g. {"mon":20,"tue":20,"wed":20,"thu":20,"fri":20}. Values must sum to 100 (validated in app). One team-wide SHAPE; per-setter AMOUNTS come from the target resolver.';

-- updated_at maintenance (reuses the existing shared trigger function)
DROP TRIGGER IF EXISTS update_role_target_defaults_updated_at ON public.role_target_defaults;
CREATE TRIGGER update_role_target_defaults_updated_at
  BEFORE UPDATE ON public.role_target_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_individual_targets_updated_at ON public.individual_targets;
CREATE TRIGGER update_individual_targets_updated_at
  BEFORE UPDATE ON public.individual_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_pace_curves_updated_at ON public.pace_curves;
CREATE TRIGGER update_pace_curves_updated_at
  BEFORE UPDATE ON public.pace_curves
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS (final): staff reads; admin/dev/ops + scoped sdr_manager writes ─────
ALTER TABLE public.role_target_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.individual_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pace_curves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view role target defaults" ON public.role_target_defaults;
CREATE POLICY "Staff can view role target defaults"
  ON public.role_target_defaults FOR SELECT TO authenticated USING (true);

-- Write: admin/dev/ops fully; sdr_manager only for setter-role rows.
DROP POLICY IF EXISTS "Target managers can write role target defaults" ON public.role_target_defaults;
CREATE POLICY "Target managers can write role target defaults"
  ON public.role_target_defaults FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
    OR (has_role(auth.uid(), 'sdr_manager'::app_role) AND role = 'setter')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
    OR (has_role(auth.uid(), 'sdr_manager'::app_role) AND role = 'setter')
  );

DROP POLICY IF EXISTS "Staff can view individual targets" ON public.individual_targets;
CREATE POLICY "Staff can view individual targets"
  ON public.individual_targets FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'sdr_manager'::app_role)
    OR subject_profile_id IN (SELECT id FROM public.setters_profiles WHERE user_id = auth.uid())
  );

-- Write: admin/dev/ops fully; sdr_manager only for setters in their
-- assignment scope (is_sdr_manager_for_setter — the same scoping already
-- trusted on pip_records, belt-and-braces combined with the role check).
DROP POLICY IF EXISTS "Target managers can write individual targets" ON public.individual_targets;
CREATE POLICY "Target managers can write individual targets"
  ON public.individual_targets FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
    OR (has_role(auth.uid(), 'sdr_manager'::app_role) AND is_sdr_manager_for_setter(auth.uid(), subject_profile_id))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
    OR (has_role(auth.uid(), 'sdr_manager'::app_role) AND is_sdr_manager_for_setter(auth.uid(), subject_profile_id))
  );

DROP POLICY IF EXISTS "Staff can view pace curves" ON public.pace_curves;
CREATE POLICY "Staff can view pace curves"
  ON public.pace_curves FOR SELECT TO authenticated USING (true);

-- Write: admin/dev/ops/sdr_manager (the curve is a team-wide shape).
DROP POLICY IF EXISTS "Target managers can write pace curves" ON public.pace_curves;
CREATE POLICY "Target managers can write pace curves"
  ON public.pace_curves FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'sdr_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'sdr_manager'::app_role)
  );

-- ── Seed: Nadia-confirmed fulfilment setter minimums (mixed grain) ──────────
INSERT INTO public.role_target_defaults (role, department, metric, period, target_value)
VALUES
  ('setter', 'fulfilment', 'booked',       'day',  1),
  ('setter', 'fulfilment', 'talk_minutes', 'day',  90),
  ('setter', 'fulfilment', 'dials',        'day',  200),
  ('setter', 'fulfilment', 'sat',          'week', 2)
ON CONFLICT (role, department, metric, period) DO NOTHING;

-- Starting curve: even spread (effectively linear) until Nadia edits his
-- custom shape via the curve editor. One SHAPE per department per period.
INSERT INTO public.pace_curves (department, period, weights)
VALUES ('fulfilment', 'week', '{"mon":20,"tue":20,"wed":20,"thu":20,"fri":20}'::jsonb)
ON CONFLICT (department, period) DO NOTHING;

-- Setters read their OWN attendance (Phase-3 addition, flagged at checkpoint):
-- the setter's own RAG card computes absence-aware pace from their attendance,
-- but employee_attendance reads were admin-tier / sdr_manager-scoped only.
-- Self-read only — a setter still cannot see anyone else's attendance.
DROP POLICY IF EXISTS "Setters can view their own attendance" ON public.employee_attendance;
CREATE POLICY "Setters can view their own attendance"
  ON public.employee_attendance FOR SELECT TO authenticated
  USING (employee_id = auth.uid());
