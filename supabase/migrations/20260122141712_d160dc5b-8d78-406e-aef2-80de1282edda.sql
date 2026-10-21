-- Fix meeting_logs RLS to allow setters to INSERT their own logs
DROP POLICY IF EXISTS "Setters can insert their own meeting_logs" ON public.meeting_logs;

CREATE POLICY "Setters can insert their own meeting_logs"
ON public.meeting_logs
FOR INSERT
TO authenticated
WITH CHECK (
  setter_id IN (
    SELECT id FROM setters_profiles WHERE user_id = auth.uid()
  )
);

-- Also allow setters to UPDATE their own logs
DROP POLICY IF EXISTS "Setters can update their own meeting_logs" ON public.meeting_logs;

CREATE POLICY "Setters can update their own meeting_logs"
ON public.meeting_logs
FOR UPDATE
TO authenticated
USING (
  setter_id IN (
    SELECT id FROM setters_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  setter_id IN (
    SELECT id FROM setters_profiles WHERE user_id = auth.uid()
  )
);