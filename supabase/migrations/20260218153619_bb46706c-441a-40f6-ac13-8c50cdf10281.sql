
-- Allow SDR managers to view setter_feedback for their assigned setters
CREATE POLICY "SDR managers can view assigned setter feedback"
ON public.setter_feedback
FOR SELECT
USING (
  public.has_sdr_manager_role(auth.uid())
  AND setter_id IN (
    SELECT sp.user_id
    FROM public.sdr_manager_assignments sma
    JOIN public.setters_profiles sp ON sp.id = sma.setter_profile_id
    WHERE sma.manager_user_id = auth.uid()
    AND sp.user_id IS NOT NULL
  )
);
