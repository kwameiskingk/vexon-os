
-- Fix the on_meeting_status_to_sat trigger: remove reference to non-existent updated_at column on setters_profiles
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
  -- Only process when attendance_status changes TO 'sat'
  IF NEW.attendance_status = 'sat' 
     AND (OLD.attendance_status IS NULL OR OLD.attendance_status != 'sat') THEN
    
    -- Get setter profile from logged_by_setter_id first, fallback to setter_id
    SELECT id, user_id, per_meeting_bonus, department 
    INTO v_setter_profile_id, v_setter_user_id, v_per_meeting_bonus, v_department
    FROM public.setters_profiles 
    WHERE user_id = COALESCE(NEW.logged_by_setter_id, NEW.setter_id);
    
    IF v_setter_profile_id IS NOT NULL THEN
      -- Update setter's meetings_sat and commission_earned (no updated_at column in setters_profiles)
      UPDATE public.setters_profiles 
      SET 
        meetings_sat = COALESCE(meetings_sat, 0) + 1,
        commission_earned = COALESCE(commission_earned, 0) + COALESCE(v_per_meeting_bonus, 0)
      WHERE id = v_setter_profile_id;
      
      -- Update setter_client_assignments if this is for assigned client (fulfillment)
      IF v_department = 'fulfilment' AND NEW.client_profile_id IS NOT NULL THEN
        UPDATE public.setter_client_assignments
        SET 
          meetings_completed = meetings_completed + 1,
          updated_at = NOW()
        WHERE setter_id = v_setter_profile_id
          AND client_id = NEW.client_profile_id
          AND status = 'active';
      END IF;
      
      -- Update campaign meetings_sat if client has active campaign
      IF NEW.client_profile_id IS NOT NULL THEN
        UPDATE public.campaigns
        SET 
          meetings_sat = COALESCE(meetings_sat, 0) + 1,
          updated_at = NOW()
        WHERE client_id = NEW.client_profile_id
          AND status = 'active';
      END IF;
    END IF;
    
    -- Update client_profiles.kpi_meetings_sat for the associated client
    IF NEW.client_profile_id IS NOT NULL THEN
      UPDATE public.client_profiles
      SET 
        kpi_meetings_sat = COALESCE(kpi_meetings_sat, 0) + 1,
        kpi_last_updated = NOW(),
        updated_at = NOW()
      WHERE id = NEW.client_profile_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Also update setter view policy to include logged_by_setter_id
DROP POLICY IF EXISTS "Setters can view their own meetings" ON public.meetings;
CREATE POLICY "Setters can view their own meetings"
ON public.meetings
FOR SELECT
USING (auth.uid() = setter_id OR auth.uid() = logged_by_setter_id);
