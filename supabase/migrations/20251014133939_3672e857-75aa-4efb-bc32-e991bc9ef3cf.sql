-- Create client_profiles table
CREATE TABLE public.client_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  size TEXT,
  country TEXT,
  contact_name TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_profiles
CREATE POLICY "Users can view their own client profile"
ON public.client_profiles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own client profile"
ON public.client_profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own client profile"
ON public.client_profiles
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all client profiles"
ON public.client_profiles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage all client profiles"
ON public.client_profiles
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add new columns to meetings table
ALTER TABLE public.meetings
ADD COLUMN client_user_id UUID,
ADD COLUMN client_profile_id UUID;

-- Add trigger for updated_at on client_profiles
CREATE TRIGGER update_client_profiles_updated_at
BEFORE UPDATE ON public.client_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();