-- Add follow_up_count column to track number of follow-up attempts for each discovery
ALTER TABLE public.sales_discovery_logs 
ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0;