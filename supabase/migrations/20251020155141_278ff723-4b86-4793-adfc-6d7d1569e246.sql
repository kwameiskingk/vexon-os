-- Drop the existing check constraint on leads.source
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;

-- Add updated check constraint with all workflow source values
ALTER TABLE public.leads ADD CONSTRAINT leads_source_check 
CHECK (source IN (
  'Cold Call',
  'Cold Email',
  'Referral',
  'Social Media',
  'Website',
  'Other',
  'manual_entry',
  'imported',
  'cold_call',
  'email',
  'referral',
  'social'
) OR source IS NULL);