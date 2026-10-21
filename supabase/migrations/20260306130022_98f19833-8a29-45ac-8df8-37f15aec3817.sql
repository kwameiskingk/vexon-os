-- Allow CSM and ops to view all leads
CREATE POLICY "CSM and ops can view all leads"
ON public.leads FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('csm'::app_role, 'ops'::app_role, 'dev'::app_role)
  )
);

-- Allow CSM and ops to update leads (for assignment)
CREATE POLICY "CSM and ops can update leads"
ON public.leads FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('csm'::app_role, 'ops'::app_role, 'admin'::app_role, 'dev'::app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('csm'::app_role, 'ops'::app_role, 'admin'::app_role, 'dev'::app_role)
  )
);