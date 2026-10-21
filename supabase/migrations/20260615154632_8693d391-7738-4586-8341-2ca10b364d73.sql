
CREATE TABLE public.client_name_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  sheet_name text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX client_name_aliases_sheet_name_key
  ON public.client_name_aliases (lower(trim(sheet_name)));

CREATE INDEX client_name_aliases_profile_idx
  ON public.client_name_aliases (client_profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_name_aliases TO authenticated;
GRANT ALL ON public.client_name_aliases TO service_role;

ALTER TABLE public.client_name_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/dev/ops/csm can view aliases"
  ON public.client_name_aliases FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'ops'::app_role)
    OR public.has_role(auth.uid(), 'csm'::app_role)
  );

CREATE POLICY "Admin/dev/ops/csm can insert aliases"
  ON public.client_name_aliases FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'ops'::app_role)
    OR public.has_role(auth.uid(), 'csm'::app_role)
  );

CREATE POLICY "Admin/dev/ops/csm can delete aliases"
  ON public.client_name_aliases FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'ops'::app_role)
    OR public.has_role(auth.uid(), 'csm'::app_role)
  );
