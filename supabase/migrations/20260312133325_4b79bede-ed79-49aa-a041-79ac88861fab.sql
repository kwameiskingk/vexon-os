-- Allow SDR managers to view attendance records for their assigned setters
CREATE POLICY "SDR managers can view assigned setter attendance"
  ON public.employee_attendance
  FOR SELECT
  TO authenticated
  USING (
    has_sdr_manager_role(auth.uid())
    AND employee_id IN (
      SELECT sp.user_id FROM setters_profiles sp
      INNER JOIN sdr_manager_assignments sma ON sma.setter_profile_id = sp.id
      WHERE sma.manager_user_id = auth.uid()
    )
  );

-- Allow SDR managers to insert attendance for their assigned setters
CREATE POLICY "SDR managers can insert assigned setter attendance"
  ON public.employee_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_sdr_manager_role(auth.uid())
    AND employee_id IN (
      SELECT sp.user_id FROM setters_profiles sp
      INNER JOIN sdr_manager_assignments sma ON sma.setter_profile_id = sp.id
      WHERE sma.manager_user_id = auth.uid()
    )
  );

-- Allow SDR managers to update attendance for their assigned setters
CREATE POLICY "SDR managers can update assigned setter attendance"
  ON public.employee_attendance
  FOR UPDATE
  TO authenticated
  USING (
    has_sdr_manager_role(auth.uid())
    AND employee_id IN (
      SELECT sp.user_id FROM setters_profiles sp
      INNER JOIN sdr_manager_assignments sma ON sma.setter_profile_id = sp.id
      WHERE sma.manager_user_id = auth.uid()
    )
  );

-- Allow SDR managers to delete attendance for their assigned setters
CREATE POLICY "SDR managers can delete assigned setter attendance"
  ON public.employee_attendance
  FOR DELETE
  TO authenticated
  USING (
    has_sdr_manager_role(auth.uid())
    AND employee_id IN (
      SELECT sp.user_id FROM setters_profiles sp
      INNER JOIN sdr_manager_assignments sma ON sma.setter_profile_id = sp.id
      WHERE sma.manager_user_id = auth.uid()
    )
  );