-- Add prospect_job_title column to meetings table
ALTER TABLE public.meetings 
ADD COLUMN prospect_job_title text;