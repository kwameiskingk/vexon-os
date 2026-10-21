-- Add CSM-managed fields to client_profiles for the new client dashboard cards
ALTER TABLE client_profiles 
ADD COLUMN IF NOT EXISTS terms_sent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS vacancies_taken_on INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS potential_placement_fee_value NUMERIC(12,2) DEFAULT 0;

-- Add tracking field for CSM sat reminder notifications
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS csm_sat_reminder_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS csm_one_hour_reminder_sent BOOLEAN DEFAULT FALSE;

-- Create trigger to notify CSM when client accepts a meeting
CREATE OR REPLACE FUNCTION public.notify_csm_meeting_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only trigger when client_accepted changes to true
  IF NEW.client_accepted = true AND (OLD.client_accepted IS NULL OR OLD.client_accepted = false) THEN
    -- Notify all CSM users
    INSERT INTO public.notifications (
      recipient_role,
      title,
      message,
      category,
      link_url,
      triggered_by
    )
    VALUES (
      'csm',
      'Meeting Accepted by Client',
      'Client ' || NEW.company_name || ' has accepted their meeting scheduled for ' || TO_CHAR(NEW.meeting_date::date, 'Mon DD, YYYY') || ' at ' || NEW.meeting_time,
      'meeting',
      '/csm/dashboard',
      NEW.client_user_id
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create the trigger on meetings table for client acceptance
DROP TRIGGER IF EXISTS on_client_accepts_meeting ON meetings;
CREATE TRIGGER on_client_accepts_meeting
  AFTER UPDATE ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION notify_csm_meeting_accepted();

-- Update the on_meeting_status_to_sat trigger to also update client_profiles.kpi_meetings_sat
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
    
    -- Get setter profile from logged_by_setter_id (user_id)
    SELECT id, user_id, per_meeting_bonus, department 
    INTO v_setter_profile_id, v_setter_user_id, v_per_meeting_bonus, v_department
    FROM public.setters_profiles 
    WHERE user_id = NEW.logged_by_setter_id;
    
    IF v_setter_profile_id IS NOT NULL THEN
      -- Update setter's meetings_sat and commission_earned
      UPDATE public.setters_profiles 
      SET 
        meetings_sat = COALESCE(meetings_sat, 0) + 1,
        commission_earned = COALESCE(commission_earned, 0) + COALESCE(v_per_meeting_bonus, 0),
        updated_at = NOW()
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