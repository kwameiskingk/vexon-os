-- Add columns for default campaign markers on client profiles
ALTER TABLE public.client_profiles
ADD COLUMN terms_signed_date DATE,
ADD COLUMN campaign_start_date DATE;

-- Add comment for documentation
COMMENT ON COLUMN public.client_profiles.terms_signed_date IS 'Date when the client signed their terms agreement';
COMMENT ON COLUMN public.client_profiles.campaign_start_date IS 'Date when the campaign officially began';