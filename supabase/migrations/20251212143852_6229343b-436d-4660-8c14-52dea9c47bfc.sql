-- Fix campaigns RLS policy to include all admin roles (dev, admin, ops, finance, csm, account_executive)
DROP POLICY IF EXISTS "Admins can manage all campaigns" ON public.campaigns;

CREATE POLICY "Admin roles can manage all campaigns" 
ON public.campaigns 
FOR ALL 
USING (is_admin_role(auth.uid()))
WITH CHECK (is_admin_role(auth.uid()));