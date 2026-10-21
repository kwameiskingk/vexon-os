-- Allow setters to view admin roles for messaging purposes
CREATE POLICY "Setters can view admin roles for messaging"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'setter'::app_role) 
  AND role = 'admin'::app_role
);