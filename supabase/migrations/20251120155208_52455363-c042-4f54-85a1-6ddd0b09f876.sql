-- Allow setters to view all other active setter profiles for rivalry selection
DROP POLICY IF EXISTS "Setters can view their own profile" ON setters_profiles;

CREATE POLICY "Setters can view all active setter profiles"
ON setters_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'setter'::app_role) AND active = true
);