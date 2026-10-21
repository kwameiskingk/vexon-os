-- Create a trigger function to auto-create client_profiles when a user with role='client' is created
CREATE OR REPLACE FUNCTION public.handle_new_client_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the new user has 'client' role
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = NEW.id AND role = 'client'
  ) THEN
    -- Insert client profile with default "Unspecified" company name
    INSERT INTO public.client_profiles (user_id, company_name, created_at)
    VALUES (NEW.id, 'Unspecified', now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to run after user role is assigned
CREATE OR REPLACE FUNCTION public.handle_client_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the new role is 'client', create a client_profiles record
  IF NEW.role = 'client' THEN
    INSERT INTO public.client_profiles (user_id, company_name, created_at)
    VALUES (NEW.user_id, 'Unspecified', now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on user_roles table
CREATE TRIGGER on_client_role_assigned
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_client_role_assignment();