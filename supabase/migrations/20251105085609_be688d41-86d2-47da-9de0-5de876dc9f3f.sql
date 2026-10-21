-- Add health_score field to client_profiles table
ALTER TABLE public.client_profiles 
ADD COLUMN health_score integer DEFAULT 5 CHECK (health_score >= 0 AND health_score <= 10);

COMMENT ON COLUMN public.client_profiles.health_score IS 'Client health score ranging from 0-10, manually adjustable by admins';