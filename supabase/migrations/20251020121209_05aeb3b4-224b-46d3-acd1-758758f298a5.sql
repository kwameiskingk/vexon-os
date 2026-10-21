-- Create setters_profiles table
CREATE TABLE public.setters_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE(user_id)
);

-- Enable RLS on setters_profiles
ALTER TABLE public.setters_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for setters_profiles
CREATE POLICY "Admins can manage all setter profiles"
ON public.setters_profiles
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Setters can view their own profile"
ON public.setters_profiles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Setters can update their own profile"
ON public.setters_profiles
FOR UPDATE
USING (auth.uid() = user_id);

-- Add missing fields to meetings table
ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS setter_profile_id UUID REFERENCES public.setters_profiles(id),
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- Create function to handle setter role assignment
CREATE OR REPLACE FUNCTION public.handle_setter_role_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_email text;
  user_name text;
BEGIN
  -- If the new role is 'setter', create a setter_profiles record
  IF NEW.role = 'setter' THEN
    -- Get user email and name from profiles table
    SELECT email, full_name INTO user_email, user_name
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    INSERT INTO public.setters_profiles (user_id, email, full_name, active, created_at)
    VALUES (NEW.user_id, user_email, user_name, true, now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for setter role assignment
DROP TRIGGER IF EXISTS on_setter_role_assigned ON public.user_roles;
CREATE TRIGGER on_setter_role_assigned
AFTER INSERT OR UPDATE ON public.user_roles
FOR EACH ROW
WHEN (NEW.role = 'setter')
EXECUTE FUNCTION public.handle_setter_role_assignment();