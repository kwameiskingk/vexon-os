-- Add invoice_external_status column to accounting_records
ALTER TABLE public.accounting_records 
ADD COLUMN IF NOT EXISTS invoice_external_status TEXT DEFAULT 'pending';

-- Migrate existing external_status data to new column
UPDATE public.accounting_records 
SET invoice_external_status = CASE 
  WHEN external_status IS NOT NULL THEN LOWER(external_status)
  ELSE 'pending'
END
WHERE invoice_external_status = 'pending' OR invoice_external_status IS NULL;

-- Create payment_history table for audit trail
CREATE TABLE IF NOT EXISTS public.payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_record_id UUID NOT NULL REFERENCES public.accounting_records(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('paid', 'partial', 'written_off', 'reverted', 'overdue')),
  amount NUMERIC,
  admin_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on payment_history
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for admins
CREATE POLICY "Admins can manage payment history" 
ON public.payment_history
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_payment_history_accounting_record_id 
ON public.payment_history(accounting_record_id);

-- Update status enum to include written_off (if not already present)
-- Note: We'll use TEXT for status flexibility since the enum may not include all values
COMMENT ON COLUMN public.accounting_records.invoice_external_status IS 'Tracks Xero invoice lifecycle: pending, sent, failed, voided';
COMMENT ON COLUMN public.accounting_records.status IS 'Tracks payment lifecycle: paid, partial, due, overdue, written_off';