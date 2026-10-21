-- Add payment deferral columns to accounting_records
ALTER TABLE public.accounting_records 
ADD COLUMN IF NOT EXISTS is_deferred boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS deferral_reason text,
ADD COLUMN IF NOT EXISTS deferral_end_date date,
ADD COLUMN IF NOT EXISTS original_next_payment_due date;

-- Add comment for clarity
COMMENT ON COLUMN public.accounting_records.is_deferred IS 'Whether payment tracking is currently deferred';
COMMENT ON COLUMN public.accounting_records.deferral_reason IS 'Reason for deferral (e.g., Campaign paused)';
COMMENT ON COLUMN public.accounting_records.deferral_end_date IS 'When deferral ends and tracking resumes';
COMMENT ON COLUMN public.accounting_records.original_next_payment_due IS 'Original due date before deferral was applied';