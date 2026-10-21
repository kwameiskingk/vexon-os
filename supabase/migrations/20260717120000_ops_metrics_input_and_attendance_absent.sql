-- Batch 1, Ops Command Centre (Elena) — approved 2026-07-17
-- Part 1: ops role may write acquisition rows into manual_daily_metrics
--         (mirrors the CSM fulfilment-scoped policies; own entries only)
-- Part 2: notification trigger — input_higher mismatch on an acquisition
--         setter row notifies that specific setter and flips mismatch_notified
-- Part 3: employee_attendance gains an explicit 'absent' status
-- NOTE: applied manually via SQL Editor 2026-07-17; migration bookkeeping unaware.
--       Never `supabase db push` this file. Add to the repair list:
--       supabase migration repair --status applied 20260717120000

-- ============================================================
-- PART 1 — RLS: ops can insert/update acquisition manual metrics
-- ============================================================

CREATE POLICY "Ops can insert acquisition manual_daily_metrics"
  ON public.manual_daily_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'ops'::public.app_role)
    AND department = 'acquisition'::public.metrics_department
    AND entered_by = auth.uid()
  );

CREATE POLICY "Ops can update acquisition manual_daily_metrics"
  ON public.manual_daily_metrics
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'ops'::public.app_role)
    AND department = 'acquisition'::public.metrics_department
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'ops'::public.app_role)
    AND department = 'acquisition'::public.metrics_department
    AND entered_by = auth.uid()
  );

-- ============================================================
-- PART 2 — mismatch notification trigger (acquisition only)
-- ============================================================
-- Fires when a row lands in the input_higher state (ops recorded more
-- meetings than the setter logged). Notifies the specific setter via the
-- existing notifications system and marks the row notified. Re-saving a
-- row whose mismatch state hasn't changed does NOT re-notify.

CREATE OR REPLACE FUNCTION public.notify_setter_meeting_log_mismatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mismatch_flag = 'input_higher'::public.mismatch_flag_type
     AND NEW.department = 'acquisition'::public.metrics_department
     AND NEW.target_role = 'setter'::public.metrics_target_role
     AND NEW.target_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.mismatch_flag IS DISTINCT FROM NEW.mismatch_flag)
  THEN
    INSERT INTO public.notifications
      (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
    VALUES (
      'setter'::public.app_role,
      NEW.target_user_id,
      'Unlogged meeting flagged',
      'Ops recorded ' || COALESCE(NEW.meetings_booked_input, 0) ||
      ' meeting(s) for you on ' || to_char(NEW.date, 'DD Mon YYYY') ||
      ' but only ' || COALESCE(NEW.meetings_booked_app, 0) ||
      ' are logged in Vexon OS. Please log your meeting(s).',
      'kpi'::public.notification_category,
      '/setter/meetings',
      NEW.entered_by
    );
    NEW.mismatch_notified := true;
  ELSIF TG_OP = 'UPDATE'
     AND NEW.mismatch_flag = OLD.mismatch_flag
     AND OLD.mismatch_notified
  THEN
    -- unchanged mismatch state on a re-save: preserve the notified marker
    -- (the app always submits mismatch_notified = false)
    NEW.mismatch_notified := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_meeting_log_mismatch ON public.manual_daily_metrics;

CREATE TRIGGER trg_notify_meeting_log_mismatch
  BEFORE INSERT OR UPDATE ON public.manual_daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_setter_meeting_log_mismatch();

-- ============================================================
-- PART 3 — attendance: explicit 'absent' status
-- ============================================================
-- Widens the allowed values. Absence of a row still means "not yet
-- marked"; 'absent' now means a confirmed absence. Additive only —
-- existing rows are untouched.

ALTER TABLE public.employee_attendance
  DROP CONSTRAINT IF EXISTS employee_attendance_status_check;

ALTER TABLE public.employee_attendance
  ADD CONSTRAINT employee_attendance_status_check
  CHECK (status IN ('present', 'late', 'half_day', 'absent'));
