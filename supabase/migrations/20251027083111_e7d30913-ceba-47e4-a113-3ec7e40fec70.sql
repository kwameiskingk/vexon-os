-- Add missing columns to campaigns table for campaign health tracking
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS meetings_booked INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS meeting_target INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS calls_outbound INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS call_target INTEGER DEFAULT 200,
ADD COLUMN IF NOT EXISTS call_duration_seconds INTEGER DEFAULT 0;

-- Update existing rows to have default values where NULL
UPDATE public.campaigns
SET 
  meetings_booked = COALESCE(meetings_booked, 0),
  meeting_target = COALESCE(meeting_target, 10),
  calls_outbound = COALESCE(calls_outbound, 0),
  call_target = COALESCE(call_target, 200),
  call_duration_seconds = COALESCE(call_duration_seconds, 0)
WHERE 
  meetings_booked IS NULL 
  OR meeting_target IS NULL 
  OR calls_outbound IS NULL 
  OR call_target IS NULL 
  OR call_duration_seconds IS NULL;