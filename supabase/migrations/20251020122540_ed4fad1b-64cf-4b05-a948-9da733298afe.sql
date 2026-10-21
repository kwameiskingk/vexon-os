-- Drop and recreate the client role assignment trigger to be more explicit
DROP TRIGGER IF EXISTS on_client_role_assigned ON public.user_roles CASCADE;
DROP FUNCTION IF EXISTS public.handle_client_role_assignment() CASCADE;

-- Recreate with explicit client-only logic
CREATE OR REPLACE FUNCTION public.handle_client_role_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- ONLY create client_profiles if the role is explicitly 'client'
  IF NEW.role = 'client' THEN
    INSERT INTO public.client_profiles (user_id, company_name, status, onboarding_complete, created_at)
    VALUES (NEW.user_id, 'Unspecified', 'active', false, now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_client_role_assigned
  AFTER INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_client_role_assignment();