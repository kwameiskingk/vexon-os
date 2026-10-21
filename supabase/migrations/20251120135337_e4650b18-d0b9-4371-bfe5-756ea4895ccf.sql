-- Add rivalry_started_at field to track when rivalry was set
ALTER TABLE public.setters_profiles
ADD COLUMN IF NOT EXISTS rivalry_started_at timestamp with time zone;

-- Add rivalry_end_pending field to track if rivalry end is pending admin approval
ALTER TABLE public.setters_profiles
ADD COLUMN IF NOT EXISTS rivalry_end_pending boolean DEFAULT false;