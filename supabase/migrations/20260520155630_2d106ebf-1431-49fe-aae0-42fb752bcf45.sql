
ALTER TABLE public.client_stipulations DROP CONSTRAINT IF EXISTS client_stipulations_client_id_fkey;
ALTER TABLE public.client_stipulations
  ADD CONSTRAINT client_stipulations_client_profile_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.client_profiles(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Admins can manage all stipulations" ON public.client_stipulations;

CREATE POLICY "Staff can view stipulations"
  ON public.client_stipulations FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'sdr_manager'::app_role)
    OR has_role(auth.uid(), 'ops_assistant'::app_role)
  );

CREATE POLICY "Staff can insert stipulations"
  ON public.client_stipulations FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'sdr_manager'::app_role)
    OR has_role(auth.uid(), 'ops_assistant'::app_role)
  );

CREATE POLICY "Staff can update stipulations"
  ON public.client_stipulations FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'sdr_manager'::app_role)
    OR has_role(auth.uid(), 'ops_assistant'::app_role)
  );

CREATE POLICY "Staff can delete stipulations"
  ON public.client_stipulations FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'sdr_manager'::app_role)
  );
