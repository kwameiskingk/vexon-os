
-- Add contract_value (investment/retainer amount) to client_profiles
ALTER TABLE public.client_profiles ADD COLUMN IF NOT EXISTS contract_value numeric DEFAULT 0;

-- Add client_profile_id to warm_leads for client attribution
ALTER TABLE public.warm_leads ADD COLUMN IF NOT EXISTS client_profile_id uuid REFERENCES public.client_profiles(id) ON DELETE SET NULL;

-- Create client_metric_entries for dated terms_sent and vacancies_taken_on tracking
CREATE TABLE public.client_metric_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid REFERENCES public.client_profiles(id) ON DELETE CASCADE NOT NULL,
  metric_type text NOT NULL CHECK (metric_type IN ('terms_sent', 'vacancies_taken_on')),
  value integer NOT NULL DEFAULT 1,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_metric_entries ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read
CREATE POLICY "Authenticated users can read metric entries" ON public.client_metric_entries
  FOR SELECT TO authenticated USING (true);

-- RLS: authenticated users can insert
CREATE POLICY "Authenticated users can insert metric entries" ON public.client_metric_entries
  FOR INSERT TO authenticated WITH CHECK (true);

-- RLS: authenticated users can delete their own entries
CREATE POLICY "Authenticated users can delete metric entries" ON public.client_metric_entries
  FOR DELETE TO authenticated USING (true);
