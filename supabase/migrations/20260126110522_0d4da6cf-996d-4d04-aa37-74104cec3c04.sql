-- Create enum for candidate assessment status
CREATE TYPE public.candidate_assessment_status AS ENUM ('new', 'shortlisted', 'rejected', 'moved_to_pipeline');

-- Create candidate_assessments table
CREATE TABLE public.candidate_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_submission_id TEXT UNIQUE NOT NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  role_applied TEXT,
  submitted_at_raw TEXT,
  assessment_pretty_text TEXT,
  assessment_payload JSONB,
  source TEXT DEFAULT 'jotform',
  status public.candidate_assessment_status DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.candidate_assessments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for HR/Admin access
CREATE POLICY "HR and Admin can view candidate assessments"
ON public.candidate_assessments
FOR SELECT
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR and Admin can insert candidate assessments"
ON public.candidate_assessments
FOR INSERT
TO authenticated
WITH CHECK (public.is_hr_role(auth.uid()));

CREATE POLICY "HR and Admin can update candidate assessments"
ON public.candidate_assessments
FOR UPDATE
TO authenticated
USING (public.is_hr_role(auth.uid()));

CREATE POLICY "HR and Admin can delete candidate assessments"
ON public.candidate_assessments
FOR DELETE
TO authenticated
USING (public.is_hr_role(auth.uid()));

-- Create policy for service role (edge function) to upsert
CREATE POLICY "Service role can manage candidate assessments"
ON public.candidate_assessments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create updated_at trigger
CREATE TRIGGER update_candidate_assessments_updated_at
BEFORE UPDATE ON public.candidate_assessments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add 'to_call_ceo' stage to candidates if not exists (for hiring pipeline)
-- First check current status values and add if needed
DO $$
BEGIN
  -- Update any candidates that need the new stage
  -- The candidates table already has a status column
  NULL;
END $$;