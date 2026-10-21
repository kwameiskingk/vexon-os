-- Create AE compensation table for managing Account Executive commission settings
CREATE TABLE public.ae_compensation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  commission_percentage NUMERIC(5,2) DEFAULT 0,
  commission_per_deal NUMERIC(10,2) DEFAULT 0,
  base_salary NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ae_compensation ENABLE ROW LEVEL SECURITY;

-- Dev role can do everything
CREATE POLICY "Dev users can manage all AE compensation"
ON public.ae_compensation
FOR ALL
USING (public.is_dev(auth.uid()));

-- AE can read their own compensation
CREATE POLICY "AEs can view their own compensation"
ON public.ae_compensation
FOR SELECT
USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_ae_compensation_updated_at
BEFORE UPDATE ON public.ae_compensation
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();