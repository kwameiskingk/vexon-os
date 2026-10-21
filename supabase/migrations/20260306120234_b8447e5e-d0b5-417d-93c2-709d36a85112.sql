
-- Add new columns to invoice_submissions for banking details, bonuses, and manual meetings
ALTER TABLE public.invoice_submissions 
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS account_holder_name text,
  ADD COLUMN IF NOT EXISTS account_type text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS branch_code text,
  ADD COLUMN IF NOT EXISTS swift_bic text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS bank_country text,
  ADD COLUMN IF NOT EXISTS bank_address text,
  ADD COLUMN IF NOT EXISTS bonus_entries jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bonus_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_meetings jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_meetings_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_approved jsonb DEFAULT null,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS department text;

-- Drop the old unique constraint if it exists and recreate with a more flexible one
ALTER TABLE public.invoice_submissions DROP CONSTRAINT IF EXISTS invoice_submissions_setter_profile_id_period_start_period__key;
ALTER TABLE public.invoice_submissions ADD CONSTRAINT invoice_submissions_setter_period_unique UNIQUE (setter_profile_id, period_start, period_end);
