-- Drop the restrictive profiles SELECT policy that blocks admins from seeing other profiles
-- The "Users can view their own profile" policy is too restrictive and conflicts with admin access
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Recreate a more permissive policy that allows users to see their own profile AND admins to see all
CREATE POLICY "Users can view profiles" ON public.profiles
FOR SELECT
USING (
  auth.uid() = id OR has_role(auth.uid(), 'admin'::app_role)
);

-- Ensure setters can see all profiles for messaging purposes
CREATE POLICY "Setters can view all profiles for messaging" ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'setter'::app_role)
);