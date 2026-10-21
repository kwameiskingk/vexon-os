-- Allow all authenticated users to view profiles for team collaboration
CREATE POLICY "Team members can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);