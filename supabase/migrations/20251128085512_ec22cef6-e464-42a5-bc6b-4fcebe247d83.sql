-- Add Xero integration fields to accounting_records
ALTER TABLE accounting_records
ADD COLUMN IF NOT EXISTS send_method TEXT,
ADD COLUMN IF NOT EXISTS correlation_id TEXT,
ADD COLUMN IF NOT EXISTS external_invoice_id TEXT,
ADD COLUMN IF NOT EXISTS external_invoice_number TEXT,
ADD COLUMN IF NOT EXISTS external_invoice_url TEXT,
ADD COLUMN IF NOT EXISTS external_status TEXT,
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE;