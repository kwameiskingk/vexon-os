-- Allow setters to update their own profile (for rivalry selection)
-- Keep the existing admin policy
-- Update the setter select policy to see ALL active profiles
-- Add update policy for setters

DROP POLICY IF EXISTS "Setters can view all active setter profiles" ON setters_profiles;
DROP POLICY IF EXISTS "Setters can update their own profile" ON setters_profiles;

-- Setters can view ALL setter profiles (not just active ones, to see rivals even if deactivated)
CREATE POLICY "Setters can view all setter profiles"
ON setters_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'setter'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Setters can update ONLY their own profile
CREATE POLICY "Setters can update own profile"
ON setters_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);