-- Allow setters to read client profiles for their active assignments
CREATE POLICY "Setters can view assigned client profiles"
ON client_profiles
FOR SELECT
USING (
  id IN (
    SELECT client_id 
    FROM setter_client_assignments 
    WHERE setter_id IN (
      SELECT id FROM setters_profiles WHERE user_id = auth.uid()
    )
    AND status = 'active'
  )
);