-- A) Add campaign_id to meetings table for tracking which campaign the meeting was attached to
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id);

-- C) Drop the unique constraint that limits setter to 1 active assignment
DROP INDEX IF EXISTS idx_unique_active_assignment;

-- C) Create trigger to enforce max 5 active assignments per setter
CREATE OR REPLACE FUNCTION public.enforce_max_5_active_assignments()
RETURNS TRIGGER AS $$
DECLARE
  active_count INTEGER;
BEGIN
  IF NEW.status = 'active' THEN
    SELECT COUNT(*) INTO active_count
    FROM setter_client_assignments
    WHERE setter_id = NEW.setter_id
      AND status = 'active'
      AND id != COALESCE(NEW.id, 'e5514f7d-add5-40dc-8307-c6abdd3e4ccc'::uuid);
    
    IF active_count >= 5 THEN
      RAISE EXCEPTION 'Setter cannot have more than 5 active client assignments';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS check_max_active_assignments ON setter_client_assignments;
CREATE TRIGGER check_max_active_assignments
BEFORE INSERT OR UPDATE ON setter_client_assignments
FOR EACH ROW EXECUTE FUNCTION public.enforce_max_5_active_assignments();

-- D) Create BEFORE INSERT trigger to auto-assign client and campaign
CREATE OR REPLACE FUNCTION public.on_meeting_insert_auto_assign()
RETURNS TRIGGER AS $$
DECLARE
  v_setter_profile_id UUID;
  v_client_id UUID;
  v_campaign_id UUID;
  v_assignment_count INTEGER;
BEGIN
  -- Only auto-assign if client_profile_id is not set and setter is known
  IF NEW.client_profile_id IS NULL AND NEW.logged_by_setter_id IS NOT NULL THEN
    
    -- Get setter profile id from user_id
    SELECT id INTO v_setter_profile_id
    FROM setters_profiles
    WHERE user_id = NEW.logged_by_setter_id;
    
    IF v_setter_profile_id IS NOT NULL THEN
      -- Count active assignments
      SELECT COUNT(*) INTO v_assignment_count
      FROM setter_client_assignments
      WHERE setter_id = v_setter_profile_id AND status = 'active';
      
      IF v_assignment_count = 1 THEN
        -- Single assignment: use that client
        SELECT client_id INTO v_client_id
        FROM setter_client_assignments
        WHERE setter_id = v_setter_profile_id AND status = 'active';
        
      ELSIF v_assignment_count > 1 THEN
        -- Multiple assignments: find client with most recent active campaign
        SELECT sca.client_id INTO v_client_id
        FROM setter_client_assignments sca
        JOIN campaigns c ON c.client_id::text = sca.client_id AND c.status = 'active'
        WHERE sca.setter_id = v_setter_profile_id AND sca.status = 'active'
        ORDER BY COALESCE(c.start_date, c.created_at) DESC
        LIMIT 1;
        
        -- If no client has active campaign, just pick the first assignment
        IF v_client_id IS NULL THEN
          SELECT client_id INTO v_client_id
          FROM setter_client_assignments
          WHERE setter_id = v_setter_profile_id AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1;
        END IF;
      END IF;
      
      -- Set client_profile_id if resolved
      IF v_client_id IS NOT NULL THEN
        NEW.client_profile_id := v_client_id;
        
        -- Also find and set the campaign_id (most recent active campaign for this client)
        SELECT id INTO v_campaign_id
        FROM campaigns
        WHERE client_id::text = v_client_id AND status = 'active'
        ORDER BY COALESCE(start_date, created_at) DESC
        LIMIT 1;
        
        IF v_campaign_id IS NOT NULL THEN
          NEW.campaign_id := v_campaign_id;
        END IF;
      END IF;
    END IF;
  -- If client_profile_id IS set but campaign_id is not, find the campaign
  ELSIF NEW.client_profile_id IS NOT NULL AND NEW.campaign_id IS NULL THEN
    SELECT id INTO v_campaign_id
    FROM campaigns
    WHERE client_id::text = NEW.client_profile_id AND status = 'active'
    ORDER BY COALESCE(start_date, created_at) DESC
    LIMIT 1;
    
    IF v_campaign_id IS NOT NULL THEN
      NEW.campaign_id := v_campaign_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_meeting_auto_assign ON meetings;
CREATE TRIGGER trigger_meeting_auto_assign
BEFORE INSERT ON meetings
FOR EACH ROW EXECUTE FUNCTION public.on_meeting_insert_auto_assign();

-- D) Update on_meeting_booked to use specific campaign_id instead of all active campaigns
CREATE OR REPLACE FUNCTION public.on_meeting_booked()
RETURNS TRIGGER AS $$
BEGIN
  -- Update client profile metrics
  IF NEW.client_profile_id IS NOT NULL THEN
    UPDATE client_profiles
    SET kpi_meetings_booked = COALESCE(kpi_meetings_booked, 0) + 1,
        kpi_last_updated = now()
    WHERE id = NEW.client_profile_id;
  END IF;
  
  -- Update specific campaign if campaign_id is set
  IF NEW.campaign_id IS NOT NULL THEN
    UPDATE campaigns
    SET meetings_booked = COALESCE(meetings_booked, 0) + 1,
        updated_at = now()
    WHERE id = NEW.campaign_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the trigger (it should already exist, but ensure it's using updated function)
DROP TRIGGER IF EXISTS on_meeting_booked ON meetings;
CREATE TRIGGER on_meeting_booked
AFTER INSERT ON meetings
FOR EACH ROW EXECUTE FUNCTION public.on_meeting_booked();