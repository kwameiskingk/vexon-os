-- Add status enum for client profiles
CREATE TYPE client_profile_status AS ENUM ('active', 'inactive');

-- Add status and onboarding_complete fields to client_profiles
ALTER TABLE public.client_profiles 
ADD COLUMN IF NOT EXISTS status client_profile_status DEFAULT 'active',
ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;

-- Create index for faster queries on status
CREATE INDEX IF NOT EXISTS idx_client_profiles_status ON public.client_profiles(status);
CREATE INDEX IF NOT EXISTS idx_client_profiles_onboarding ON public.client_profiles(onboarding_complete);

-- Update existing client profiles to have default status
UPDATE public.client_profiles SET status = 'active' WHERE status IS NULL;
UPDATE public.client_profiles SET onboarding_complete = false WHERE onboarding_complete IS NULL;

-- Create admin activity log table
CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on admin activity log
ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view and insert activity logs
CREATE POLICY "Admins can view activity logs"
ON public.admin_activity_log
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert activity logs"
ON public.admin_activity_log
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Update the client role assignment trigger to handle status
CREATE OR REPLACE FUNCTION public.handle_client_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- If the new role is 'client', create a client_profiles record
  IF NEW.role = 'client' THEN
    INSERT INTO public.client_profiles (user_id, company_name, status, onboarding_complete, created_at)
    VALUES (NEW.user_id, 'Unspecified', 'active', false, now())
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    -- If role is changed to setter or admin, delete client profile
    DELETE FROM public.client_profiles WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;