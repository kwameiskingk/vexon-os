-- Add pre_meeting_insights field to meetings table
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS pre_meeting_insights jsonb;

-- Add comment for clarity
COMMENT ON COLUMN public.meetings.pre_meeting_insights IS 'Stores pre-meeting insight answers as JSON object';