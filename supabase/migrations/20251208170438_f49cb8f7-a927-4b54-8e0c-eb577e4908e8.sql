
-- Drop the old restrictive policy that only allowed 'admin' role
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

-- Create new policy that allows all admin-level roles to view all roles
CREATE POLICY "Admin roles can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (is_admin_role(auth.uid()));
