-- Allow CSM, ops, admin, dev to view all warm leads
CREATE POLICY "CSM and ops can view all warm leads"
ON public.warm_leads FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('csm'::app_role, 'ops'::app_role)
  )
);

-- Allow CSM, ops, admin, dev to update warm leads (for assignment/approval)
CREATE POLICY "CSM and ops can update warm leads"
ON public.warm_leads FOR UPDATE
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

-- Allow clients to view approved warm leads assigned to their profile
CREATE POLICY "Clients can view approved warm leads"
ON public.warm_leads FOR SELECT
TO authenticated
USING (
  approval_status = 'approved'
  AND client_profile_id IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.client_profile_users
      WHERE client_profile_id = warm_leads.client_profile_id
      AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.client_profiles
      WHERE id = warm_leads.client_profile_id
      AND user_id = auth.uid()
    )
  )
);