-- Add meeting requirements column to client_profiles
ALTER TABLE public.client_profiles 
ADD COLUMN IF NOT EXISTS kpi_meeting_requirements INTEGER DEFAULT 0;