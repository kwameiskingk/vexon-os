-- Add per_meeting_bonus column to setters_profiles
ALTER TABLE public.setters_profiles 
ADD COLUMN IF NOT EXISTS per_meeting_bonus NUMERIC(10,2) DEFAULT 25.00;

-- Add comment for clarity
COMMENT ON COLUMN public.setters_profiles.per_meeting_bonus IS 'USD bonus amount the setter earns per sat meeting';