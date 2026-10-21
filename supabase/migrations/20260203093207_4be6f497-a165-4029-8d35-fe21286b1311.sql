-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Users can insert their own feedback" ON public.setter_feedback;

-- Create new INSERT policy that allows all authenticated users except clients to insert their own feedback
CREATE POLICY "All team members can insert their own feedback"
ON public.setter_feedback
FOR INSERT
WITH CHECK (
  auth.uid() = setter_id
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role != 'client'
  )
);