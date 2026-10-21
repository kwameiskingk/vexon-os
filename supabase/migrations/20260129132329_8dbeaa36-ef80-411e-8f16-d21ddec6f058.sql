-- Update RLS policy on setters_profiles to include sdr_manager role

DROP POLICY IF EXISTS "Setters and admins can view all setter profiles" ON setters_profiles;

CREATE POLICY "Setters, SDR managers and admins can view setter profiles"
ON setters_profiles FOR SELECT
TO public
USING (
  has_role(auth.uid(), 'setter'::app_role) 
  OR has_role(auth.uid(), 'sdr_manager'::app_role)
  OR is_admin_role(auth.uid())
);