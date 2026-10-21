-- 1. New candidate intake fields
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS years_cold_calling_uk integer,
  ADD COLUMN IF NOT EXISTS years_appointment_setting integer,
  ADD COLUMN IF NOT EXISTS last_position text,
  ADD COLUMN IF NOT EXISTS last_product_sold text,
  ADD COLUMN IF NOT EXISTS avg_monthly_appointments_last_role integer;

-- 2. CEO growth-metrics inputs (manual monthly overrides)
CREATE TABLE IF NOT EXISTS public.ceo_growth_inputs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month date NOT NULL UNIQUE,
  cac_amount numeric,
  cost_to_fulfil numeric,
  marketing_spend numeric,
  new_clients integer,
  currency text NOT NULL DEFAULT 'GBP',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ceo_growth_inputs TO authenticated;
GRANT ALL ON public.ceo_growth_inputs TO service_role;

ALTER TABLE public.ceo_growth_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage growth inputs"
  ON public.ceo_growth_inputs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role));

CREATE TRIGGER update_ceo_growth_inputs_updated_at
  BEFORE UPDATE ON public.ceo_growth_inputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();