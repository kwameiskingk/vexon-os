-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Admins can manage all discovery logs" ON public.sales_discovery_logs;

-- Create new policy using is_admin_role function which includes dev, admin, ops, finance, csm, account_executive
CREATE POLICY "Admin roles can manage all discovery logs" 
ON public.sales_discovery_logs 
FOR ALL 
USING (is_admin_role(auth.uid()))
WITH CHECK (is_admin_role(auth.uid()));