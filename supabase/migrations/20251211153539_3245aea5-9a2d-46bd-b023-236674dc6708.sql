-- Create pitch_calls table for tracking follow-up pitch calls
CREATE TABLE public.pitch_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  discovery_log_id UUID REFERENCES public.sales_discovery_logs(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  company_name TEXT,
  pitch_call_date DATE NOT NULL,
  pitch_call_time TIME,
  original_outcome TEXT,
  original_interest TEXT,
  contract_value NUMERIC,
  contract_term TEXT,
  fathom_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'scheduled',
  pitch_outcome TEXT,
  pitch_interest TEXT,
  converted_to_client BOOLEAN DEFAULT false,
  marked_not_proceeding BOOLEAN DEFAULT false,
  client_profile_id UUID REFERENCES public.client_profiles(id),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pitch_calls ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for admin roles
CREATE POLICY "Admin roles can manage all pitch calls"
ON public.pitch_calls
FOR ALL
USING (is_admin_role(auth.uid()))
WITH CHECK (is_admin_role(auth.uid()));

-- Create index for efficient querying
CREATE INDEX idx_pitch_calls_date ON public.pitch_calls(pitch_call_date);
CREATE INDEX idx_pitch_calls_status ON public.pitch_calls(status);
CREATE INDEX idx_pitch_calls_discovery_log_id ON public.pitch_calls(discovery_log_id);

-- Create trigger for updated_at
CREATE TRIGGER update_pitch_calls_updated_at
BEFORE UPDATE ON public.pitch_calls
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();