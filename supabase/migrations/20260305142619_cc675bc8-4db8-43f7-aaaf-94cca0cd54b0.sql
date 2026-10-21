CREATE OR REPLACE FUNCTION public.handle_client_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role != 'client' THEN
    RETURN NEW;
  END IF;

  -- Secondary users are linked through client_profile_users and must not create new client_profiles.
  IF EXISTS (
    SELECT 1
    FROM public.client_profile_users cpu
    WHERE cpu.user_id = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.client_profiles (user_id, company_name, status, created_at)
  VALUES (NEW.user_id, 'Unspecified', 'active', now())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;