DROP POLICY "Users can create own leave requests" ON public.employee_leave_requests;

CREATE POLICY "Users can create leave requests"
ON public.employee_leave_requests FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR is_admin_role(auth.uid())
  OR is_hr_role(auth.uid())
);