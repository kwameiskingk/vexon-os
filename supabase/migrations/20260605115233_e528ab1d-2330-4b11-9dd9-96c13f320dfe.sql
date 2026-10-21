ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS job_roles jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS job_spec_provided boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS job_spec_text text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS job_spec_file_url text DEFAULT NULL;