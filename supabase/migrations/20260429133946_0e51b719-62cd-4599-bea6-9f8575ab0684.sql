-- Allow any internal setter to view active client profiles so they can
-- attribute meetings to clients they aren't currently rostered/assigned to.
-- Sensitive child tables (credentials, source materials, etc.) remain
-- protected by their own RLS policies.
CREATE POLICY "Setters can view active client profiles for meeting logging"
ON public.client_profiles
FOR SELECT
TO authenticated
USING (
  status = 'active'
  AND EXISTS (
    SELECT 1 FROM public.setters_profiles sp
    WHERE sp.user_id = auth.uid()
  )
);