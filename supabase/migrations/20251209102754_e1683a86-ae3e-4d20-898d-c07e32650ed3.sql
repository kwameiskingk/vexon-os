-- Add department column to meetings table
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS department text;

-- Extend client_profile_status enum to include 'pending'
ALTER TYPE public.client_profile_status ADD VALUE IF NOT EXISTS 'pending';

-- Add new fields to sales_discovery_logs for enhanced workflow
ALTER TABLE public.sales_discovery_logs 
ADD COLUMN IF NOT EXISTS client_interest text,
ADD COLUMN IF NOT EXISTS follow_up_date date,
ADD COLUMN IF NOT EXISTS converted_to_client boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS client_profile_id uuid REFERENCES public.client_profiles(id),
ADD COLUMN IF NOT EXISTS marked_not_proceeding boolean DEFAULT false;

-- Add index for department-based queries
CREATE INDEX IF NOT EXISTS idx_meetings_department ON public.meetings(department);

-- Add index for discovery logs client profile lookup
CREATE INDEX IF NOT EXISTS idx_discovery_logs_client_profile ON public.sales_discovery_logs(client_profile_id);