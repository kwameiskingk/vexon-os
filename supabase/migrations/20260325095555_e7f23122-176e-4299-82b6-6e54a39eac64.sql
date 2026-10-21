
-- Add job_specs JSONB column for Job Spec + Callback entries (array of {type: 'text'|'file', content: string, file_name?: string})
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS job_specs jsonb DEFAULT '[]'::jsonb;

-- Add terms_fees text column for Terms Requested + Callback fee information
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS terms_fees text;

-- Add job_spec_files storage for uploaded documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-spec-files', 'job-spec-files', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for job-spec-files bucket: authenticated users can upload
CREATE POLICY "Authenticated users can upload job spec files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'job-spec-files');

-- Authenticated users can read job spec files
CREATE POLICY "Authenticated users can read job spec files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'job-spec-files');
