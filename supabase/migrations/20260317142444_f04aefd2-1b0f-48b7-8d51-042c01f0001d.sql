
-- Add is_ceased flag to accounting_records
ALTER TABLE public.accounting_records
ADD COLUMN is_ceased boolean NOT NULL DEFAULT false;

-- Add ceased_at timestamp for tracking when it was ceased
ALTER TABLE public.accounting_records
ADD COLUMN ceased_at timestamptz DEFAULT null;
