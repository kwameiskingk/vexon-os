-- Add logo and team_network_member fields to clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS logo text,
ADD COLUMN IF NOT EXISTS team_network_member boolean DEFAULT false;

-- Add logo and team_network_member fields to client_profiles table
ALTER TABLE public.client_profiles
ADD COLUMN IF NOT EXISTS logo text,
ADD COLUMN IF NOT EXISTS team_network_member boolean DEFAULT false;

-- Ensure campaigns table has all required fields
-- Add missing fields if they don't exist
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS launch_date date,
ADD COLUMN IF NOT EXISTS campaign_number integer DEFAULT 1;

-- Update the sync trigger to include new fields
CREATE OR REPLACE FUNCTION public.sync_client_profile_to_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_email text;
BEGIN
  -- ONLY sync if actual client data fields changed (not KPI fields)
  -- Skip if only KPI fields were updated
  IF (TG_OP = 'UPDATE') THEN
    -- Check if only KPI fields changed
    IF (OLD.company_name IS NOT DISTINCT FROM NEW.company_name AND
        OLD.contact_name IS NOT DISTINCT FROM NEW.contact_name AND
        OLD.phone IS NOT DISTINCT FROM NEW.phone AND
        OLD.website IS NOT DISTINCT FROM NEW.website AND
        OLD.industry IS NOT DISTINCT FROM NEW.industry AND
        OLD.size IS NOT DISTINCT FROM NEW.size AND
        OLD.country IS NOT DISTINCT FROM NEW.country AND
        OLD.logo IS NOT DISTINCT FROM NEW.logo AND
        OLD.team_network_member IS NOT DISTINCT FROM NEW.team_network_member AND
        OLD.user_id IS NOT DISTINCT FROM NEW.user_id) THEN
      -- Only KPI fields changed, don't sync
      RETURN NEW;
    END IF;
  END IF;

  -- Get user email from profiles table
  SELECT email INTO user_email
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- Insert or update clients table ONLY when client data actually changes
  INSERT INTO public.clients (
    id,
    company_name,
    contact_name,
    email,
    mobile,
    company_website,
    industry,
    company_size,
    country,
    logo,
    team_network_member,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.company_name,
    COALESCE(NEW.contact_name, 'Pending'),
    COALESCE(user_email, ''),
    NEW.phone,
    NEW.website,
    NEW.industry,
    NEW.size,
    NEW.country,
    NEW.logo,
    NEW.team_network_member,
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    company_name = EXCLUDED.company_name,
    contact_name = EXCLUDED.contact_name,
    email = EXCLUDED.email,
    mobile = EXCLUDED.mobile,
    company_website = EXCLUDED.company_website,
    industry = EXCLUDED.industry,
    company_size = EXCLUDED.company_size,
    country = EXCLUDED.country,
    logo = EXCLUDED.logo,
    team_network_member = EXCLUDED.team_network_member,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$function$;