-- Fix the on_meeting_insert_auto_assign trigger function to handle UUID comparison properly
CREATE OR REPLACE FUNCTION public.on_meeting_insert_auto_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        SELECT sca.client_id::uuid INTO v_client_id
        FROM setter_client_assignments sca
        JOIN campaigns c ON c.client_id = sca.client_id::uuid AND c.status = 'active'
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
        WHERE client_id = v_client_id AND status = 'active'
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
    WHERE client_id = NEW.client_profile_id AND status = 'active'
    ORDER BY COALESCE(start_date, created_at) DESC
    LIMIT 1;
    
    IF v_campaign_id IS NOT NULL THEN
      NEW.campaign_id := v_campaign_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;