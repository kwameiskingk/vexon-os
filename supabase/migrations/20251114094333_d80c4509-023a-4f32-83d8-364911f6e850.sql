-- Drop existing insert policy for setter_feedback
DROP POLICY IF EXISTS "Setters can insert their own feedback" ON setter_feedback;

-- Create new policy that allows both setters and admins to insert feedback
CREATE POLICY "Users can insert their own feedback"
ON setter_feedback
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = setter_id AND 
  (has_role(auth.uid(), 'setter'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);