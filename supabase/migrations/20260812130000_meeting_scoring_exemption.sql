-- Stage 1: Scoring exemption on sat meetings.
-- A sat meeting can be exempted from scoring when the client-side attendee
-- wasn't available. It still counts as sat everywhere (show-up rate, sat counts,
-- client health, leaderboards); it is removed from the "To score" queues and is
-- never part of any quality denominator (it is not scored zero).

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS scoring_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scoring_exempt_reason text,
  ADD COLUMN IF NOT EXISTS scoring_exempt_by uuid,
  ADD COLUMN IF NOT EXISTS scoring_exempt_at timestamptz;

COMMENT ON COLUMN public.meetings.scoring_exempt IS
  'Sat meeting excluded from scoring (client-side attendee unavailable). Counts as sat everywhere; excluded from To score queues and from all quality denominators. Not a client_stipulations reference.';
COMMENT ON COLUMN public.meetings.scoring_exempt_reason IS
  'Free-text reason entered when the exemption was set.';
COMMENT ON COLUMN public.meetings.scoring_exempt_by IS
  'auth.users id of the person who set the exemption.';
COMMENT ON COLUMN public.meetings.scoring_exempt_at IS
  'When the exemption was set.';

-- Guard the score->sat back-write: a scoring-exempt meeting must never have its
-- attendance driven by a score row (defensive; exempt meetings are already sat).
CREATE OR REPLACE FUNCTION public.auto_sat_on_meeting_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.matched = true AND NEW.appointment_id IS NOT NULL THEN
    UPDATE public.meetings
    SET attendance_status = 'sat'
    WHERE id = NEW.appointment_id
      AND (attendance_status IS NULL OR attendance_status = 'pending')
      AND scoring_exempt = false;
  END IF;
  RETURN NEW;
END;
$$;
