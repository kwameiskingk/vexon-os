-- Add RLS policy for users linked via client_profile_users table
CREATE POLICY "Users can view linked client profiles"
  ON client_profiles FOR SELECT
  USING (
    auth.uid() = user_id
    OR
    id IN (
      SELECT client_profile_id 
      FROM client_profile_users 
      WHERE user_id = auth.uid()
    )
  );