-- Remove duplicate trigger (on_meeting_booked and trigger_meeting_booked both call the same function)
DROP TRIGGER IF EXISTS on_meeting_booked ON public.meetings;