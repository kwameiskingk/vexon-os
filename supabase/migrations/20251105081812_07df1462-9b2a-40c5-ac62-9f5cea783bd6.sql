-- Fix the sync function to NEVER overwrite existing client data with NULL values
-- This prevents data loss when client_profiles has incomplete data
CREATE OR REPLACE FUNCTION public.sync_client_profile_to_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_email text;
  existing_client record;
BEGIN
  -- ONLY sync if actual client data fields changed (not KPI fields)
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

  -- Get existing client data to preserve values
  SELECT * INTO existing_client
  FROM public.clients
  WHERE id = NEW.id;

  -- Insert or update clients table - ONLY update fields that have non-NULL values in client_profiles
  -- This prevents overwriting existing data with NULL values
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
    -- Only update if the new value is NOT NULL, otherwise keep existing
    company_name = COALESCE(EXCLUDED.company_name, clients.company_name),
    contact_name = COALESCE(EXCLUDED.contact_name, clients.contact_name),
    email = COALESCE(EXCLUDED.email, clients.email),
    mobile = COALESCE(EXCLUDED.mobile, clients.mobile),
    company_website = COALESCE(EXCLUDED.company_website, clients.company_website),
    industry = COALESCE(EXCLUDED.industry, clients.industry),
    company_size = COALESCE(EXCLUDED.company_size, clients.company_size),
    country = COALESCE(EXCLUDED.country, clients.country),
    logo = COALESCE(EXCLUDED.logo, clients.logo),
    team_network_member = COALESCE(EXCLUDED.team_network_member, clients.team_network_member),
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$function$;