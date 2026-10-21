-- Drop existing admin-only policy
DROP POLICY IF EXISTS "Admins can manage resources" ON public.resources;

-- Create new policy allowing admin-level roles to manage resources
CREATE POLICY "Admin roles can manage resources" 
ON public.resources 
FOR ALL 
USING (is_admin_role(auth.uid()))
WITH CHECK (is_admin_role(auth.uid()));