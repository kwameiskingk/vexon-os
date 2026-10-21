
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
  v_app_meeting_count INTEGER;
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
  v_logged_date := COALESCE(NEW.created_at::date, CURRENT_DATE);
  
  -- Count actual app-logged meetings for this setter on this date
  SELECT COUNT(*) INTO v_app_meeting_count
  FROM meetings
  WHERE (logged_by_setter_id = setter_user_id OR setter_id = setter_user_id)
    AND created_at::date = v_logged_date;
  
  -- Upsert into performance table using GREATEST to preserve hybrid MAX logic
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
    v_app_meeting_count,
    COALESCE(setter_user_id, NEW.setter_id),
    COALESCE(setter_user_id, NEW.setter_id),
    now(),
    now()
  )
  ON CONFLICT (setter_id, date) 
  DO UPDATE SET
    meetings_booked = GREATEST(v_app_meeting_count, COALESCE(performance.meetings_booked, 0)),
    email = EXCLUDED.email,
    updated_at = now();
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_meeting_to_performance failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
