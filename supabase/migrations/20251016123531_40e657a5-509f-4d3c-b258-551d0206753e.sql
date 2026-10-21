-- Fix the sync trigger to handle NULL contact_name
CREATE OR REPLACE FUNCTION public.sync_client_profile_to_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
BEGIN
  -- Get user email from profiles table
  SELECT email INTO user_email
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- Insert or update clients table
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
    COALESCE(NEW.contact_name, 'Pending'), -- Provide default for NULL contact_name
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
$$;