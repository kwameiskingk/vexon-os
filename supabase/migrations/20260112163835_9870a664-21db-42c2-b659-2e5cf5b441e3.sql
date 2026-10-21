-- Add weekly_meetings_target column to setters_profiles
ALTER TABLE public.setters_profiles 
ADD COLUMN IF NOT EXISTS weekly_meetings_target INTEGER DEFAULT 50;