
-- 1. Allow setters to delete meetings they logged
CREATE POLICY "Setters can delete their own meetings"
ON public.meetings
FOR DELETE
TO authenticated
USING (
  auth.uid() = setter_id
  OR auth.uid() = logged_by_setter_id
);

-- 2. Allow setters to delete agreement_send_queue entries linked to discovery logs for their meetings
CREATE POLICY "Setters can delete agreement queue for their meetings"
ON public.agreement_send_queue
FOR DELETE
TO authenticated
USING (
  discovery_log_id IN (
    SELECT sdl.id FROM public.sales_discovery_logs sdl
    JOIN public.meetings m ON sdl.meeting_id = m.id
    WHERE m.setter_id = auth.uid() OR m.logged_by_setter_id = auth.uid()
  )
);

-- 3. Allow setters to delete discovery logs linked to their meetings
CREATE POLICY "Setters can delete discovery logs for their meetings"
ON public.sales_discovery_logs
FOR DELETE
TO authenticated
USING (
  meeting_id IN (
    SELECT id FROM public.meetings
    WHERE setter_id = auth.uid() OR logged_by_setter_id = auth.uid()
  )
);

-- 4. Fix FK to cascade deletes so meeting deletion auto-cleans discovery logs
ALTER TABLE public.sales_discovery_logs DROP CONSTRAINT IF EXISTS sales_discovery_logs_meeting_id_fkey;
ALTER TABLE public.sales_discovery_logs ADD CONSTRAINT sales_discovery_logs_meeting_id_fkey 
  FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;

-- 5. Also fix original_meeting_id FK on meetings to not block deletion
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_original_meeting_id_fkey;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_original_meeting_id_fkey 
  FOREIGN KEY (original_meeting_id) REFERENCES public.meetings(id) ON DELETE SET NULL;
