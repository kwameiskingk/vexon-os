-- Allow all admin-level roles (dev, admin, ops, finance, csm, account_executive) to manage meeting logs
DROP POLICY IF EXISTS "Admins can manage meeting_logs" ON public.meeting_logs;

CREATE POLICY "Admin roles can manage meeting_logs"
ON public.meeting_logs
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.is_admin_role(auth.uid()))
WITH CHECK (public.is_admin_role(auth.uid()));
