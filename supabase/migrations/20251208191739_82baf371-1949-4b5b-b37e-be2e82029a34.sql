-- Add meeting_id column to link discovery logs to meetings
ALTER TABLE public.sales_discovery_logs
ADD COLUMN meeting_id UUID REFERENCES public.meetings(id);

-- Create index for faster lookups
CREATE INDEX idx_sales_discovery_logs_meeting_id ON public.sales_discovery_logs(meeting_id);