-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Admins can manage all accounting records" ON accounting_records;

-- Create a new PERMISSIVE policy using is_admin_role which includes dev, ops, finance, csm, account_executive
CREATE POLICY "Admin roles can manage all accounting records"
ON accounting_records
FOR ALL
USING (is_admin_role(auth.uid()))
WITH CHECK (is_admin_role(auth.uid()));