-- Unified attendance: authority tracking, "Elena's explicit mark wins",
-- shared-gate write scoping for sdr_manager, and a daily completion nudge.
--
-- AUDIT RESULT (verified in code + live DB before this migration): both
-- surfaces — Ops Command Attendance and the SDR-manager Team Feedback
-- Attendance tab — already write the SAME table, public.employee_attendance
-- (UNIQUE(employee_id, date); status present/late/half_day/absent; unmarked
-- = no row). There is NO second table and therefore NO data merge and NO
-- (person,date) collisions. The performance review's days-worked reads this
-- table (present/late = 1, half_day = 0.5) and is untouched by this change.
--
-- CONFLICT RULE: one row per (employee, date) IS the effective status —
-- conflicts can only happen at write time, so the rule is enforced there:
-- an ops-tier mark can only be changed by ops-tier; an sdr_manager mark can
-- be changed by either tier; absence of an ops mark never blocks (or
-- erases) an sdr_manager mark. Most-recent-within-tier falls out of upsert
-- semantics. marked_by / marked_by_role / marked_at record provenance.
--
-- NOT applied by the assistant — the owner previews and applies.

-- ── 1. Authority columns ────────────────────────────────────────────────
ALTER TABLE public.employee_attendance
  ADD COLUMN IF NOT EXISTS marked_by_role text
    CHECK (marked_by_role IS NULL OR marked_by_role IN ('ops', 'sdr_manager')),
  ADD COLUMN IF NOT EXISTS marked_at timestamptz;

-- Backfill provenance for existing marks: tier derived from the marker's
-- ACTUAL roles; legacy rows with no/unknown marker default to the higher
-- 'ops' tier (historic marks were made by staff and must stay protected).
UPDATE public.employee_attendance ea
SET
  marked_at = COALESCE(ea.updated_at, ea.created_at),
  marked_by_role = CASE
    WHEN ea.marked_by IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = ea.marked_by AND ur.role = 'sdr_manager')
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = ea.marked_by
                        AND ur.role IN ('admin','dev','ops','hr','ops_assistant','finance','csm','account_executive'))
    THEN 'sdr_manager'
    ELSE 'ops'
  END
WHERE ea.marked_by_role IS NULL;

-- ── 2. Authority tier + stamp trigger ───────────────────────────────────
-- Staff tier mirrors is_admin_role (+hr/ops_assistant, which hold HR
-- surfaces today); sdr_manager is the lower tier.
CREATE OR REPLACE FUNCTION public.attendance_authority_tier(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id
                   AND role IN ('admin','dev','ops','hr','ops_assistant','finance','csm','account_executive'))
      THEN 'ops'
    WHEN EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id AND role = 'sdr_manager')
      THEN 'sdr_manager'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_attendance_mark()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.marked_by := auth.uid();
    NEW.marked_by_role := COALESCE(public.attendance_authority_tier(auth.uid()), 'ops');
  ELSE
    -- service-role / migration writes: keep what was provided, default high
    NEW.marked_by_role := COALESCE(NEW.marked_by_role, 'ops');
  END IF;
  NEW.marked_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_attendance_stamp ON public.employee_attendance;
CREATE TRIGGER trg_employee_attendance_stamp
BEFORE INSERT OR UPDATE ON public.employee_attendance
FOR EACH ROW EXECUTE FUNCTION public.stamp_attendance_mark();

-- ── 3. sdr_manager write scoping via the SHARED gate ────────────────────
-- Replaces the assignment-based policies with the same
-- is_active_genuine_fulfilment_setter gate the review picker and reviews
-- RLS use (no parallel definition of "his setters"). Tier protection lives
-- in the UPDATE/DELETE quals: an ops-tier mark is untouchable by
-- sdr_manager. Admin/ops policies (is_admin_role) are untouched.
DROP POLICY IF EXISTS "SDR managers can view assigned setter attendance" ON public.employee_attendance;
DROP POLICY IF EXISTS "SDR managers can insert assigned setter attendance" ON public.employee_attendance;
DROP POLICY IF EXISTS "SDR managers can update assigned setter attendance" ON public.employee_attendance;
DROP POLICY IF EXISTS "SDR managers can delete assigned setter attendance" ON public.employee_attendance;

CREATE POLICY "SDR manager views fulfilment setter attendance"
ON public.employee_attendance FOR SELECT
TO authenticated
USING (
  public.has_sdr_manager_role(auth.uid())
  AND employee_id <> auth.uid()
  AND public.is_active_genuine_fulfilment_setter(employee_id)
);

CREATE POLICY "SDR manager marks fulfilment setter attendance"
ON public.employee_attendance FOR INSERT
TO authenticated
WITH CHECK (
  public.has_sdr_manager_role(auth.uid())
  AND employee_id <> auth.uid()
  AND public.is_active_genuine_fulfilment_setter(employee_id)
);

CREATE POLICY "SDR manager updates non-ops fulfilment attendance"
ON public.employee_attendance FOR UPDATE
TO authenticated
USING (
  public.has_sdr_manager_role(auth.uid())
  AND employee_id <> auth.uid()
  AND public.is_active_genuine_fulfilment_setter(employee_id)
  AND marked_by_role IS DISTINCT FROM 'ops'
)
WITH CHECK (
  public.has_sdr_manager_role(auth.uid())
  AND employee_id <> auth.uid()
  AND public.is_active_genuine_fulfilment_setter(employee_id)
);

CREATE POLICY "SDR manager clears non-ops fulfilment attendance"
ON public.employee_attendance FOR DELETE
TO authenticated
USING (
  public.has_sdr_manager_role(auth.uid())
  AND employee_id <> auth.uid()
  AND public.is_active_genuine_fulfilment_setter(employee_id)
  AND marked_by_role IS DISTINCT FROM 'ops'
);

-- ── 4. Daily completion nudge for Elena ────────────────────────────────
-- Attendance now feeds performance-review days-worked, so an incomplete day
-- gets one in-app notification (weekdays 14:00 UTC, deduped per day). Pure
-- SQL — no reminder engine.
CREATE OR REPLACE FUNCTION public.nudge_ops_attendance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unmarked_count int;
BEGIN
  SELECT count(*) INTO unmarked_count
  FROM public.setters_profiles sp
  WHERE sp.active = true
    AND COALESCE(sp.is_test_account, false) = false
    AND sp.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.employee_attendance ea
      WHERE ea.employee_id = sp.user_id AND ea.date = CURRENT_DATE
    );

  IF unmarked_count > 0 AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.recipient_id = '916e451a-9e25-4e27-89ab-a5f3374d81ac'
      AND n.title = 'Today''s attendance is incomplete'
      AND n.created_at::date = CURRENT_DATE
  ) THEN
    INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url)
    VALUES (
      'ops',
      '916e451a-9e25-4e27-89ab-a5f3374d81ac',
      'Today''s attendance is incomplete',
      unmarked_count || ' team member(s) have no attendance mark for today. Attendance feeds performance-review days worked.',
      'system',
      '/ops-command/attendance'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('ops-attendance-nudge');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'ops-attendance-nudge',
  '0 14 * * 1-5',
  $$ SELECT public.nudge_ops_attendance(); $$
);
