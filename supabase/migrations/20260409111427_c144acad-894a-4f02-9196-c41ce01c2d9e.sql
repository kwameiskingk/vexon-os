
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own leave requests" ON public.employee_leave_requests;
DROP POLICY IF EXISTS "Admin can update leave requests" ON public.employee_leave_requests;

-- Recreated SELECT policy: own requests + admin/hr roles + SDR managers for their assigned setters
CREATE POLICY "Users can view leave requests"
ON public.employee_leave_requests FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_admin_role(auth.uid())
  OR is_hr_role(auth.uid())
  OR (
    has_sdr_manager_role(auth.uid())
    AND user_id IN (
      SELECT sp.user_id FROM setters_profiles sp
      JOIN sdr_manager_assignments sma ON sma.setter_profile_id = sp.id
      WHERE sma.manager_user_id = auth.uid() AND sp.user_id IS NOT NULL
    )
  )
);

-- Recreated UPDATE policy: admin/hr roles + SDR managers for their assigned setters
CREATE POLICY "Authorized roles can update leave requests"
ON public.employee_leave_requests FOR UPDATE
TO authenticated
USING (
  is_admin_role(auth.uid())
  OR is_hr_role(auth.uid())
  OR (
    has_sdr_manager_role(auth.uid())
    AND user_id IN (
      SELECT sp.user_id FROM setters_profiles sp
      JOIN sdr_manager_assignments sma ON sma.setter_profile_id = sp.id
      WHERE sma.manager_user_id = auth.uid() AND sp.user_id IS NOT NULL
    )
  )
);
