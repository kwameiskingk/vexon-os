-- Add new fields to meetings table for Acquisition department form
ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS company_headcount text,
ADD COLUMN IF NOT EXISTS revenue_last_12_months text,
ADD COLUMN IF NOT EXISTS worked_with_lead_gen_agency text,
ADD COLUMN IF NOT EXISTS logged_by_setter_id uuid REFERENCES auth.users(id);

-- Add index for the new logged_by_setter_id field
CREATE INDEX IF NOT EXISTS idx_meetings_logged_by_setter_id ON public.meetings(logged_by_setter_id);

-- Add comment to clarify the new fields
COMMENT ON COLUMN public.meetings.company_headcount IS 'Full-time employees only, not including founder - used in Acquisition department';
COMMENT ON COLUMN public.meetings.revenue_last_12_months IS 'Revenue range in last 12 months - used in Acquisition department';
COMMENT ON COLUMN public.meetings.worked_with_lead_gen_agency IS 'Whether company worked with lead generation agency before - used in Acquisition department';
COMMENT ON COLUMN public.meetings.logged_by_setter_id IS 'User ID of the setter who logged this meeting - applies to both Acquisition and Fulfillment';