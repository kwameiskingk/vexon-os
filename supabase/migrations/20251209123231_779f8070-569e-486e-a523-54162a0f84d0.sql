-- Drop all existing policies on resources
DROP POLICY IF EXISTS "Admin roles can manage resources" ON public.resources;
DROP POLICY IF EXISTS "Admins can manage resources" ON public.resources;
DROP POLICY IF EXISTS "Everyone can view resources" ON public.resources;

-- Create PERMISSIVE policy for admin roles to manage resources (INSERT, UPDATE, DELETE)
CREATE POLICY "Admin roles can manage resources" 
ON public.resources 
AS PERMISSIVE
FOR ALL 
TO authenticated
USING (is_admin_role(auth.uid()))
WITH CHECK (is_admin_role(auth.uid()));

-- Create PERMISSIVE policy for viewing resources (role-based)
CREATE POLICY "Everyone can view resources" 
ON public.resources 
AS PERMISSIVE
FOR SELECT 
TO authenticated
USING (
  CASE
    WHEN is_admin_role(auth.uid()) THEN true
    WHEN has_role(auth.uid(), 'setter'::app_role) THEN true
    WHEN has_role(auth.uid(), 'client'::app_role) THEN (visible_to_clients = true)
    ELSE false
  END
);