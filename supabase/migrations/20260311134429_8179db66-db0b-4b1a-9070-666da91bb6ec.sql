
-- Allow setters to view meetings from all setters (needed for leaderboard counts)
-- They can already only see limited columns via the frontend query
CREATE POLICY "Setters can view all setter meetings for leaderboard"
ON public.meetings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'setter'::app_role)
  AND setter_id IS NOT NULL
);
