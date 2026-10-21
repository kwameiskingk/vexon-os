
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
      AND (attendance_status IS NULL OR attendance_status = 'pending');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_sat_on_meeting_score ON public.meeting_scores;
CREATE TRIGGER trg_auto_sat_on_meeting_score
AFTER INSERT OR UPDATE OF matched, appointment_id ON public.meeting_scores
FOR EACH ROW
EXECUTE FUNCTION public.auto_sat_on_meeting_score();
