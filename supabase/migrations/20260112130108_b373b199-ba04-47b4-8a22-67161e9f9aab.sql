-- =============================================
-- TRIGGERS FOR AUTO-UPDATING MEETING METRICS
-- =============================================

-- 1. Trigger function for when a meeting is marked as 'sat'
-- Updates: setter's meetings_sat, commission_earned, assignment's meetings_completed, campaign's meetings_sat
CREATE OR REPLACE FUNCTION public.on_meeting_status_to_sat()
RETURNS TRIGGER AS $$
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
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for meeting sat
DROP TRIGGER IF EXISTS trigger_meeting_sat ON public.meetings;
CREATE TRIGGER trigger_meeting_sat
AFTER UPDATE ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.on_meeting_status_to_sat();


-- 2. Trigger function for when a new meeting is booked
-- Updates: campaign's meetings_booked, client profile KPIs
CREATE OR REPLACE FUNCTION public.on_meeting_booked()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new meeting is created for a client with an active campaign, increment meetings_booked
  IF NEW.client_profile_id IS NOT NULL THEN
    -- Update active campaign meetings_booked
    UPDATE public.campaigns
    SET 
      meetings_booked = COALESCE(meetings_booked, 0) + 1,
      updated_at = NOW()
    WHERE client_id = NEW.client_profile_id
      AND status = 'active';
    
    -- Also update client_profiles KPI for meetings_booked
    UPDATE public.client_profiles
    SET 
      kpi_meetings_booked = COALESCE(kpi_meetings_booked, 0) + 1,
      kpi_last_updated = NOW(),
      updated_at = NOW()
    WHERE id = NEW.client_profile_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for meeting booked
DROP TRIGGER IF EXISTS trigger_meeting_booked ON public.meetings;
CREATE TRIGGER trigger_meeting_booked
AFTER INSERT ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.on_meeting_booked();


-- 3. RLS Policy for setters to read their own assignments
DROP POLICY IF EXISTS "setters_read_own_assignments" ON public.setter_client_assignments;
CREATE POLICY "setters_read_own_assignments" ON public.setter_client_assignments
FOR SELECT USING (
  setter_id IN (SELECT id FROM public.setters_profiles WHERE user_id = auth.uid())
  OR public.is_admin_role(auth.uid())
);