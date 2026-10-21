CREATE POLICY "Authorized roles can delete leave requests"
ON public.employee_leave_requests
FOR DELETE
TO authenticated
USING (
  is_admin_role(auth.uid())
  OR is_hr_role(auth.uid())
  OR (
    has_sdr_manager_role(auth.uid())
    AND user_id IN (
      SELECT sp.user_id
      FROM setters_profiles sp
      JOIN sdr_manager_assignments sma ON sma.setter_profile_id = sp.id
      WHERE sma.manager_user_id = auth.uid() AND sp.user_id IS NOT NULL
    )
  )
);