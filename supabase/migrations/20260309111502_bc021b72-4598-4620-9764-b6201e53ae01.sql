
ALTER TABLE public.invoice_submissions 
ADD COLUMN IF NOT EXISTS is_amended boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS amended_at timestamptz,
ADD COLUMN IF NOT EXISTS amendment_notes text;
