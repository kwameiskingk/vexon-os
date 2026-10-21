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
BEGIN
  -- REVERSE: if attendance_status changed FROM 'sat' to something else (e.g. cancelled)
  IF OLD.attendance_status = 'sat' AND NEW.attendance_status != 'sat' THEN
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

    RETURN NEW;
  END IF;

  -- FORWARD: when attendance_status changes TO 'sat'
  IF NEW.attendance_status = 'sat' 
     AND (OLD.attendance_status IS NULL OR OLD.attendance_status != 'sat') THEN
    
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