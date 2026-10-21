-- Auto-assign leads table entries to client based on setter's active roster
CREATE OR REPLACE FUNCTION public.auto_assign_lead_to_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_setter_profile_id UUID;
  v_client_id UUID;
  v_assignment_count INTEGER;
BEGIN
  -- Only auto-assign if assigned_client_id is not already set
  IF NEW.assigned_client_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get setter profile id
  SELECT id INTO v_setter_profile_id
  FROM setters_profiles
  WHERE user_id = NEW.setter_id;

  IF v_setter_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count active assignments
  SELECT COUNT(*) INTO v_assignment_count
  FROM setter_client_assignments
  WHERE setter_id = v_setter_profile_id AND status = 'active';

  IF v_assignment_count = 1 THEN
    SELECT client_id INTO v_client_id
    FROM setter_client_assignments
    WHERE setter_id = v_setter_profile_id AND status = 'active';

    NEW.assigned_client_id := v_client_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on leads table
DROP TRIGGER IF EXISTS trg_auto_assign_lead_to_client ON leads;
CREATE TRIGGER trg_auto_assign_lead_to_client
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_lead_to_client();

-- Also add CSM/ops SELECT policy for warm_leads if missing
-- (the existing policies require admin/dev for ALL, but csm/ops only have UPDATE, not SELECT for warm_leads)
-- Check: there IS a "CSM and ops can view all warm leads" policy already, so we're good.
