
-- Track edits to meetings/appointment logs by setters
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS edited_by uuid;

-- Allow setters to update their own meetings (so they can edit logged appointment details)
CREATE POLICY "Setters can update their own meetings"
ON public.meetings
FOR UPDATE
TO authenticated
USING (((auth.uid() = setter_id) OR (auth.uid() = logged_by_setter_id)) AND public.has_role(auth.uid(), 'setter'::app_role))
WITH CHECK (((auth.uid() = setter_id) OR (auth.uid() = logged_by_setter_id)) AND public.has_role(auth.uid(), 'setter'::app_role));
