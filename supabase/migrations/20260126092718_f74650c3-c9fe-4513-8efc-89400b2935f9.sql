-- Task 1: Add numeric goal columns to meeting_logs
ALTER TABLE public.meeting_logs
ADD COLUMN IF NOT EXISTS meetings_goal INTEGER,
ADD COLUMN IF NOT EXISTS conversations_goal INTEGER;

-- Task 2: Create job_application_forms table
CREATE TABLE public.job_application_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name TEXT NOT NULL,
  jotform_embed_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create job_application_submissions table
CREATE TABLE public.job_application_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES public.job_application_forms(id) ON DELETE SET NULL,
  candidate_name TEXT NOT NULL,
  role_applied TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  submission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  score NUMERIC(5,2),
  status TEXT DEFAULT 'pending',
  notes TEXT,
  jotform_submission_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id)
);

-- Add constraint for status values
ALTER TABLE public.job_application_submissions
ADD CONSTRAINT job_application_submissions_status_check 
CHECK (status IN ('pending', 'pass', 'fail', 'interview', 'hired', 'rejected'));

-- Enable RLS on both tables
ALTER TABLE public.job_application_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_application_submissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for job_application_forms
CREATE POLICY "HR roles can view job application forms"
ON public.job_application_forms
FOR SELECT
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can insert job application forms"
ON public.job_application_forms
FOR INSERT
TO authenticated
WITH CHECK (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can update job application forms"
ON public.job_application_forms
FOR UPDATE
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can delete job application forms"
ON public.job_application_forms
FOR DELETE
TO authenticated
USING (public.is_hr_role(auth.uid()));

-- RLS policies for job_application_submissions
CREATE POLICY "HR roles can view job application submissions"
ON public.job_application_submissions
FOR SELECT
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can insert job application submissions"
ON public.job_application_submissions
FOR INSERT
TO authenticated
WITH CHECK (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can update job application submissions"
ON public.job_application_submissions
FOR UPDATE
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR roles can delete job application submissions"
ON public.job_application_submissions
FOR DELETE
TO authenticated
USING (public.is_hr_role(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_job_application_forms_role ON public.job_application_forms(role_name);
CREATE INDEX idx_job_application_submissions_form ON public.job_application_submissions(form_id);
CREATE INDEX idx_job_application_submissions_status ON public.job_application_submissions(status);
CREATE INDEX idx_job_application_submissions_date ON public.job_application_submissions(submission_date);

-- Add updated_at triggers
CREATE TRIGGER update_job_application_forms_updated_at
BEFORE UPDATE ON public.job_application_forms
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_application_submissions_updated_at
BEFORE UPDATE ON public.job_application_submissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();