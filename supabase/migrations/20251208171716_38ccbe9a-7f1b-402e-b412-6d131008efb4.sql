-- Drop the old setter messaging policy
DROP POLICY IF EXISTS "Setters can view admin roles for messaging" ON user_roles;

-- Create new policy allowing setters to view all team roles for messaging
CREATE POLICY "Setters can view team roles for messaging"
ON user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'setter') AND
  role IN ('admin', 'dev', 'ops', 'finance', 'csm', 'account_executive', 'setter')
);