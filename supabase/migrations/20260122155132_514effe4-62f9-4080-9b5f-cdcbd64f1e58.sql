-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Admins can manage all candidates" ON candidates;

-- Create new permissive policy using is_admin_role for all admin-level roles
CREATE POLICY "Admin roles can manage all candidates"
  ON candidates
  FOR ALL
  USING (is_admin_role(auth.uid()))
  WITH CHECK (is_admin_role(auth.uid()));