
CREATE OR REPLACE FUNCTION public.sync_meeting_to_performance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  setter_email TEXT;
  setter_user_id UUID;
  v_logged_date DATE;
BEGIN
  -- Get the setter's email and user_id from their profile
  SELECT email, user_id INTO setter_email, setter_user_id
  FROM setters_profiles
  WHERE id = NEW.setter_profile_id OR user_id = NEW.setter_id;
  
  -- If no setter found, try with logged_by_setter_id
  IF setter_email IS NULL AND NEW.logged_by_setter_id IS NOT NULL THEN
    SELECT email, user_id INTO setter_email, setter_user_id
    FROM setters_profiles
    WHERE user_id = NEW.logged_by_setter_id;
  END IF;
  
  -- If still no setter found, exit gracefully
  IF setter_email IS NULL THEN
    RAISE NOTICE 'No setter email found for meeting %', NEW.id;
    RETURN NEW;
  END IF;
  
  -- Normalize email to lowercase
  setter_email := LOWER(setter_email);
  
  -- Use the date the meeting was LOGGED (created_at), not the meeting_date
  -- This ensures leaderboard shows meetings as booked on the day they were actually logged
  v_logged_date := COALESCE(NEW.created_at::date, CURRENT_DATE);
  
  -- Upsert into performance table - increment meetings_booked
  INSERT INTO performance (
    email,
    date,
    meetings_booked,
    setter_id,
    user_id,
    created_at,
    updated_at
  )
  VALUES (
    setter_email,
    v_logged_date,
    1,
    COALESCE(setter_user_id, NEW.setter_id),
    COALESCE(setter_user_id, NEW.setter_id),
    now(),
    now()
  )
  ON CONFLICT (setter_id, date) 
  DO UPDATE SET
    meetings_booked = COALESCE(performance.meetings_booked, 0) + 1,
    email = EXCLUDED.email,
    updated_at = now();
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't fail the meeting insert
  RAISE WARNING 'sync_meeting_to_performance failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
