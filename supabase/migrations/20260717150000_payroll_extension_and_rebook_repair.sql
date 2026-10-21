-- Batch 2 — payroll pipeline extension + rebook-notification repair
-- Approved 2026-07-17
-- Part 1: invoice_submissions can hold AE and staff lines; paid stamp columns
-- Part 2: payroll_cycles dedupe + uniqueness (re-compile stops duplicating)
-- Part 3: meetings.needs_setter_rebook + trigger replacing the RLS-blocked
--         client-side rebook notifications (broken since 2026-05-18)
-- NOTE: applied manually via SQL Editor 2026-07-17; migration bookkeeping unaware.
--       Never `supabase db push` this file. Repair list is now:
--       supabase migration repair --status applied 20260716120000
--       20260717090000 20260717100000 20260717120000 20260717150000

-- ============================================================
-- PART 1 — invoice_submissions: AE + staff lines, paid stamp
-- ============================================================

ALTER TABLE public.invoice_submissions
  ALTER COLUMN setter_profile_id DROP NOT NULL;

ALTER TABLE public.invoice_submissions
  ADD COLUMN IF NOT EXISTS line_type text NOT NULL DEFAULT 'setter'
    CHECK (line_type IN ('setter', 'ae', 'staff')),
  ADD COLUMN IF NOT EXISTS cash_collected numeric(12,2),
  ADD COLUMN IF NOT EXISTS commission_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid;

-- One line per person per period for non-setter lines (setter lines are
-- already covered by idx_invoice_submissions_unique_period).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_submissions_unique_nonsetter_period
  ON public.invoice_submissions (user_id, period_start, period_end)
  WHERE setter_profile_id IS NULL;

-- ============================================================
-- PART 2 — payroll_cycles: dedupe, then enforce uniqueness
-- ============================================================
-- Keeps the most recent row per (department, period); older duplicates
-- from historical re-compiles are removed.

DELETE FROM public.payroll_cycles pc
USING public.payroll_cycles newer
WHERE pc.department = newer.department
  AND pc.period_start = newer.period_start
  AND pc.period_end = newer.period_end
  AND (newer.created_at, newer.id) > (pc.created_at, pc.id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_cycles_unique_period
  ON public.payroll_cycles (department, period_start, period_end);

-- ============================================================
-- PART 3 — rebook notifications: column + trigger
-- ============================================================
-- The AE "assign back to setter" choice was never stored — it lived only in
-- a client-side notification insert that RLS has blocked since 2026-05-18.
-- The app now records the choice here, and the database sends the
-- notification itself (same pattern as trg_notify_meeting_log_mismatch).

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS needs_setter_rebook boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.notify_setter_rebook_needed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_message text;
BEGIN
  IF NEW.setter_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.attendance_status = 'no_show'
     AND OLD.attendance_status IS DISTINCT FROM NEW.attendance_status
  THEN
    v_title := 'Prospect No-Showed — Please Rebook';
    v_message := 'The prospect ' || COALESCE(NEW.prospect_name, 'unknown')
      || ' from ' || COALESCE(NEW.company_name, 'unknown company')
      || ' did not show up. Please re-engage and rebook the meeting.';
  ELSIF NEW.needs_setter_rebook
     AND NOT COALESCE(OLD.needs_setter_rebook, false)
  THEN
    v_title := 'Meeting Needs Rebooking';
    v_message := 'The discovery call with ' || COALESCE(NEW.company_name, 'unknown company')
      || ' (' || COALESCE(NEW.prospect_name, 'unknown') || ') has been rescheduled. '
      || 'Please rebook this meeting.';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
  VALUES (
    'setter'::public.app_role,
    NEW.setter_id,
    v_title,
    v_message,
    'meeting'::public.notification_category,
    '/setter/meetings',
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_setter_rebook_needed ON public.meetings;

CREATE TRIGGER trg_notify_setter_rebook_needed
  AFTER UPDATE ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_setter_rebook_needed();
