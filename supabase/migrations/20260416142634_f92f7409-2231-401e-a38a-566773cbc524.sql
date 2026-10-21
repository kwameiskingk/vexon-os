-- Allow ops_assistant to read meetings (needed to count app-logged meetings for metrics input)
CREATE POLICY "Ops assistant can view all meetings"
  ON public.meetings FOR SELECT
  USING (is_ops_assistant(auth.uid()));