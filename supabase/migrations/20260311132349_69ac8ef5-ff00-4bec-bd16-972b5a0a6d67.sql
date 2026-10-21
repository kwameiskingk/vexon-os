
-- Update sync_meeting_to_performance to exclude rebooked meetings
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
  -- Skip rebooked meetings - they should not count toward performance metrics
  IF COALESCE(NEW.is_rebook, false) = true THEN
    RETURN NEW;
  END IF;

  SELECT email, user_id INTO setter_email, setter_user_id
  FROM setters_profiles
  WHERE id = NEW.setter_profile_id OR user_id = NEW.setter_id;
  
  IF setter_email IS NULL AND NEW.logged_by_setter_id IS NOT NULL THEN
    SELECT email, user_id INTO setter_email, setter_user_id
    FROM setters_profiles
    WHERE user_id = NEW.logged_by_setter_id;
  END IF;
  
  IF setter_email IS NULL THEN
    RAISE NOTICE 'No setter email found for meeting %', NEW.id;
    RETURN NEW;
  END IF;
  
  setter_email := LOWER(setter_email);
  v_logged_date := COALESCE(NEW.created_at::date, CURRENT_DATE);
  
  -- Count actual app-logged meetings for this setter on this date, EXCLUDING rebooks
  SELECT COUNT(*) INTO v_app_meeting_count
  FROM meetings
  WHERE (logged_by_setter_id = setter_user_id OR setter_id = setter_user_id)
    AND created_at::date = v_logged_date
    AND COALESCE(is_rebook, false) = false;
  
  INSERT INTO performance (
    email, date, meetings_booked, setter_id, user_id, created_at, updated_at
  )
  VALUES (
    setter_email, v_logged_date, v_app_meeting_count,
    COALESCE(setter_user_id, NEW.setter_id),
    COALESCE(setter_user_id, NEW.setter_id),
    now(), now()
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

-- Update on_meeting_booked to exclude rebooked meetings
CREATE OR REPLACE FUNCTION public.on_meeting_booked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip rebooked meetings - they should not count toward KPIs
  IF COALESCE(NEW.is_rebook, false) = true THEN
    RETURN NEW;
  END IF;

  IF NEW.client_profile_id IS NOT NULL THEN
    UPDATE client_profiles
    SET kpi_meetings_booked = COALESCE(kpi_meetings_booked, 0) + 1,
        kpi_last_updated = now()
    WHERE id = NEW.client_profile_id;
  END IF;
  
  IF NEW.campaign_id IS NOT NULL THEN
    UPDATE campaigns
    SET meetings_booked = COALESCE(meetings_booked, 0) + 1,
        updated_at = now()
    WHERE id = NEW.campaign_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update on_meeting_status_to_sat to exclude rebooked meetings from commission/KPI cascade
CREATE OR REPLACE FUNCTION public.on_meeting_status_to_sat()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_setter_profile_id UUID;
  v_setter_user_id UUID;
  v_per_meeting_bonus NUMERIC;
  v_department TEXT;
  v_is_rebook BOOLEAN;
BEGIN
  v_is_rebook := COALESCE(NEW.is_rebook, false);

  -- REVERSE: if attendance_status changed FROM 'sat' to something else
  IF OLD.attendance_status = 'sat' AND NEW.attendance_status != 'sat' THEN
    -- Only reverse commission/KPI if it was NOT a rebook (rebooks never credited)
    IF NOT COALESCE(OLD.is_rebook, false) THEN
      SELECT id, user_id, per_meeting_bonus, department 
      INTO v_setter_profile_id, v_setter_user_id, v_per_meeting_bonus, v_department
      FROM public.setters_profiles 
      WHERE user_id = COALESCE(OLD.logged_by_setter_id, OLD.setter_id);

      IF v_setter_profile_id IS NOT NULL THEN
        UPDATE public.setters_profiles 
        SET 
          meetings_sat = GREATEST(COALESCE(meetings_sat, 0) - 1, 0),
          commission_earned = GREATEST(COALESCE(commission_earned, 0) - COALESCE(v_per_meeting_bonus, 0), 0)
        WHERE id = v_setter_profile_id;

        IF v_department = 'fulfilment' AND OLD.client_profile_id IS NOT NULL THEN
          UPDATE public.setter_client_assignments
          SET meetings_completed = GREATEST(meetings_completed - 1, 0), updated_at = NOW()
          WHERE setter_id = v_setter_profile_id AND client_id = OLD.client_profile_id AND status = 'active';
        END IF;

        IF OLD.client_profile_id IS NOT NULL THEN
          UPDATE public.campaigns
          SET meetings_sat = GREATEST(COALESCE(meetings_sat, 0) - 1, 0), updated_at = NOW()
          WHERE client_id = OLD.client_profile_id AND status = 'active';
        END IF;
      END IF;

      IF OLD.client_profile_id IS NOT NULL THEN
        UPDATE public.client_profiles
        SET kpi_meetings_sat = GREATEST(COALESCE(kpi_meetings_sat, 0) - 1, 0), kpi_last_updated = NOW(), updated_at = NOW()
        WHERE id = OLD.client_profile_id;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- FORWARD: when attendance_status changes TO 'sat'
  IF NEW.attendance_status = 'sat' 
     AND (OLD.attendance_status IS NULL OR OLD.attendance_status != 'sat') THEN
    
    -- Skip commission and KPI updates for rebooked meetings
    IF v_is_rebook THEN
      RETURN NEW;
    END IF;

    SELECT id, user_id, per_meeting_bonus, department 
    INTO v_setter_profile_id, v_setter_user_id, v_per_meeting_bonus, v_department
    FROM public.setters_profiles 
    WHERE user_id = COALESCE(NEW.logged_by_setter_id, NEW.setter_id);
    
    IF v_setter_profile_id IS NOT NULL THEN
      UPDATE public.setters_profiles 
      SET 
        meetings_sat = COALESCE(meetings_sat, 0) + 1,
        commission_earned = COALESCE(commission_earned, 0) + COALESCE(v_per_meeting_bonus, 0)
      WHERE id = v_setter_profile_id;
      
      IF v_department = 'fulfilment' AND NEW.client_profile_id IS NOT NULL THEN
        UPDATE public.setter_client_assignments
        SET meetings_completed = meetings_completed + 1, updated_at = NOW()
        WHERE setter_id = v_setter_profile_id AND client_id = NEW.client_profile_id AND status = 'active';
      END IF;
      
      IF NEW.client_profile_id IS NOT NULL THEN
        UPDATE public.campaigns
        SET meetings_sat = COALESCE(meetings_sat, 0) + 1, updated_at = NOW()
        WHERE client_id = NEW.client_profile_id AND status = 'active';
      END IF;
    END IF;
    
    IF NEW.client_profile_id IS NOT NULL THEN
      UPDATE public.client_profiles
      SET kpi_meetings_sat = COALESCE(kpi_meetings_sat, 0) + 1, kpi_last_updated = NOW(), updated_at = NOW()
      WHERE id = NEW.client_profile_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
