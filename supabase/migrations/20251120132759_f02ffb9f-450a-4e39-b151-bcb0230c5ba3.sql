-- Create recognition_awards table for custom admin-assigned awards
CREATE TABLE IF NOT EXISTS public.recognition_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  award_title TEXT NOT NULL,
  badge_type TEXT NOT NULL,
  assigned_by UUID REFERENCES auth.users(id),
  date_awarded DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.recognition_awards ENABLE ROW LEVEL SECURITY;

-- Admins can manage all recognition awards
CREATE POLICY "Admins can manage recognition awards"
ON public.recognition_awards
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Everyone can view recognition awards
CREATE POLICY "Everyone can view recognition awards"
ON public.recognition_awards
FOR SELECT
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_recognition_awards_updated_at
BEFORE UPDATE ON public.recognition_awards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();