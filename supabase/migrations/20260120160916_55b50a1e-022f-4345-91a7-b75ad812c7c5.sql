-- Create a function to sync meetings_booked count to performance table
CREATE OR REPLACE FUNCTION public.sync_meeting_to_performance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  setter_email TEXT;
  meeting_date_str TEXT;
BEGIN
  -- Get the setter's email from their profile
  SELECT email INTO setter_email
  FROM setters_profiles
  WHERE id = NEW.setter_id OR user_id::text = NEW.setter_id::text;
  
  IF setter_email IS NULL THEN
    RETURN NEW;
  END IF;
  
  meeting_date_str := NEW.meeting_date;
  
  -- Upsert into performance table - increment meetings_booked
  INSERT INTO performance (
    email,
    date,
    meetings_booked,
    setter_id,
    user_id
  )
  VALUES (
    LOWER(setter_email),
    meeting_date_str::date,
    1,
    NEW.setter_id,
    NEW.setter_id
  )
  ON CONFLICT (email, date) 
  DO UPDATE SET
    meetings_booked = performance.meetings_booked + 1,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

-- Create trigger on meetings table for INSERT
DROP TRIGGER IF EXISTS trigger_sync_meeting_to_performance ON meetings;
CREATE TRIGGER trigger_sync_meeting_to_performance
  AFTER INSERT ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION sync_meeting_to_performance();

-- Also update Aisha's current performance record to reflect her 2 logged meetings
UPDATE performance 
SET meetings_booked = 2, updated_at = now()
WHERE email = 'aisha@meridiansales.example' 
AND date = '2026-01-20';