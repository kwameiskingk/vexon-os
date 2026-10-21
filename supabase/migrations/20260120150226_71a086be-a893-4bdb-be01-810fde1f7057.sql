-- Add RLS policy for clients to view their own campaigns
CREATE POLICY "Clients can view their own campaigns"
ON public.campaigns
FOR SELECT
USING (
  client_id IN (
    SELECT client_profile_id FROM client_profile_users WHERE user_id = auth.uid()
  )
  OR
  client_id IN (
    SELECT id FROM client_profiles WHERE user_id = auth.uid()
  )
);