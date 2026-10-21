
-- Add new columns to enrichment_requests
ALTER TABLE public.enrichment_requests
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS company_domain text;

-- Add new columns to warm_leads
ALTER TABLE public.warm_leads
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS company_domain text;
