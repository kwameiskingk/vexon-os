DROP POLICY IF EXISTS "HR can view all feedback" ON public.setter_feedback;

CREATE POLICY "HR can view all feedback"
ON public.setter_feedback
FOR SELECT
USING (public.is_hr_role(auth.uid()));