-- Modify the sync trigger to ONLY fire when actual client data changes, NOT when KPI fields change
-- This prevents KPI updates from overwriting client information

DROP TRIGGER IF EXISTS sync_client_profile_to_clients_trigger ON public.client_profiles;

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
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$function$;

-- Re-create the trigger
CREATE TRIGGER sync_client_profile_to_clients_trigger
  AFTER INSERT OR UPDATE ON public.client_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_client_profile_to_clients();