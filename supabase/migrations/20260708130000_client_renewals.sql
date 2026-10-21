-- Client renewal / upsell capture (Batch 5 / N14): first-class records
-- written from the client profile's Financial Details section. Feeds the
-- CEO Client Health "Upsold clients" tile (previously hardcoded "—").
CREATE TABLE IF NOT EXISTS public.client_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('renewal', 'upsell')),
  amount numeric,
  new_contract_term text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_renewals_client ON public.client_renewals(client_profile_id);
CREATE INDEX IF NOT EXISTS idx_client_renewals_effective ON public.client_renewals(effective_date);

CREATE TRIGGER trg_client_renewals_updated_at
BEFORE UPDATE ON public.client_renewals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.client_renewals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view client renewals"
ON public.client_renewals FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
  OR public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'sdr_manager')
  OR public.has_role(auth.uid(), 'finance')
  OR public.has_role(auth.uid(), 'accounting')
);

CREATE POLICY "CSM and admins manage client renewals"
ON public.client_renewals FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
)
WITH CHECK (
  public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
);
