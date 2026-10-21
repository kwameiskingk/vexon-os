-- Fix the handle_client_role_assignment function to remove reference to non-existent onboarding_complete column
CREATE OR REPLACE FUNCTION public.handle_client_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- ONLY create client_profiles if the role is explicitly 'client'
  IF NEW.role = 'client' THEN
    INSERT INTO public.client_profiles (user_id, company_name, status, created_at)
    VALUES (NEW.user_id, 'Unspecified', 'active', now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;