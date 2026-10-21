CREATE POLICY "SDR managers can view their team meetings"
ON public.meetings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'sdr_manager'::app_role)
  AND (
    setter_profile_id IN (
      SELECT setter_profile_id FROM sdr_manager_assignments WHERE manager_user_id = auth.uid()
    )
    OR setter_id IN (
      SELECT sp.user_id FROM sdr_manager_assignments sma JOIN setters_profiles sp ON sp.id = sma.setter_profile_id WHERE sma.manager_user_id = auth.uid()
    )
    OR logged_by_setter_id IN (
      SELECT sp.user_id FROM sdr_manager_assignments sma JOIN setters_profiles sp ON sp.id = sma.setter_profile_id WHERE sma.manager_user_id = auth.uid()
    )
  )
);