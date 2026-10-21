-- Allow setters to read their own sender account (linked via setter_profile_id)
CREATE POLICY "Setters can read own sender account"
ON public.gtm_sender_accounts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'setter'
  )
  AND setter_profile_id IN (
    SELECT id FROM setters_profiles WHERE user_id = auth.uid()
  )
);