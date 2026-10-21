-- Drop the old outcome check constraint since we now use client_interest for interest level
-- and outcome for meeting status (sat, rescheduled, cancelled)
ALTER TABLE public.sales_discovery_logs DROP CONSTRAINT IF EXISTS sales_discovery_logs_outcome_check;