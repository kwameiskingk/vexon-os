-- Create candidates table for hiring management
CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile_phone TEXT,
  country TEXT CHECK (country IN ('UK', 'USA', 'Other')),
  linkedin_url TEXT,
  cv_file TEXT,
  date_of_call DATE NOT NULL,
  call_time TIME,
  call_recording_url TEXT,
  feedback_from_ops_lead TEXT,
  feedback_from_ceo TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'invited_to_interview')),
  notes TEXT,
  date_added TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can manage all candidates
CREATE POLICY "Admins can manage all candidates"
  ON candidates
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_candidates_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create storage bucket for candidate CVs
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-cvs', 'candidate-cvs', false);

-- RLS for storage: Admins can upload CVs
CREATE POLICY "Admins can upload CVs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'candidate-cvs' AND has_role(auth.uid(), 'admin'::app_role));

-- RLS for storage: Admins can view CVs
CREATE POLICY "Admins can view CVs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'candidate-cvs' AND has_role(auth.uid(), 'admin'::app_role));

-- RLS for storage: Admins can delete CVs
CREATE POLICY "Admins can delete CVs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'candidate-cvs' AND has_role(auth.uid(), 'admin'::app_role));