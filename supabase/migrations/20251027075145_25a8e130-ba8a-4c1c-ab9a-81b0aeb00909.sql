-- Add call_duration_seconds column to performance table to store raw seconds
ALTER TABLE public.performance 
ADD COLUMN IF NOT EXISTS call_duration_seconds integer DEFAULT 0;

-- Update existing talk_time values to be in seconds (multiply by 60 if they're in minutes)
-- This is safe because we're adding a new column for seconds
UPDATE public.performance 
SET call_duration_seconds = talk_time * 60
WHERE call_duration_seconds = 0 AND talk_time > 0;

-- Add comment to clarify the columns
COMMENT ON COLUMN public.performance.talk_time IS 'Talk time in minutes (legacy - being phased out)';
COMMENT ON COLUMN public.performance.call_duration_seconds IS 'Call duration in seconds (primary field)';