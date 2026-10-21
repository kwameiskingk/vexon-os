ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS prospect_job_title text;

ALTER TABLE public.warm_leads
ADD COLUMN IF NOT EXISTS prospect_job_title text;