
ALTER TABLE public.setters_profiles ADD COLUMN IF NOT EXISTS base_salary numeric DEFAULT NULL;

ALTER TABLE public.invoice_submissions ADD COLUMN IF NOT EXISTS is_first_salary boolean DEFAULT NULL;
ALTER TABLE public.invoice_submissions ADD COLUMN IF NOT EXISTS home_address text DEFAULT NULL;
