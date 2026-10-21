-- Ops Command for whoever holds can_view_ops_command (Marcus via the owner,
-- 7 Oct 2026): Daniel (csm) covers Elena's Ops Command on days she is out.
-- Elena already has all of this through her ops role; this lets the
-- capability carry the same powers on the Ops Command tabs, without widening
-- is_hr_role (which guards other HR data). Safe to run twice.

-- 1. Employee Leave: approve / decline / add on behalf.
--    is_leave_admin is used only by the employee_leave_requests policies.
CREATE OR REPLACE FUNCTION public.is_leave_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','ops','dev')
  ) OR public.has_capability(_user_id, 'can_view_ops_command')
$function$;

-- 2. Payslips (Payslip Studio + Employee Hub payroll tab).
DROP POLICY IF EXISTS "Ops Command manages payslips" ON public.employee_payslips;
CREATE POLICY "Ops Command manages payslips" ON public.employee_payslips
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ops_command'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ops_command'));

-- 3. Performance Review: reviews, briefs, period notes, metric overrides.
DROP POLICY IF EXISTS "Ops Command manages performance reviews" ON public.performance_reviews;
CREATE POLICY "Ops Command manages performance reviews" ON public.performance_reviews
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ops_command'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ops_command'));

DROP POLICY IF EXISTS "Ops Command manages performance review briefs" ON public.performance_review_briefs;
CREATE POLICY "Ops Command manages performance review briefs" ON public.performance_review_briefs
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ops_command'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ops_command'));

DROP POLICY IF EXISTS "Ops Command manages setter period notes" ON public.setter_period_notes;
CREATE POLICY "Ops Command manages setter period notes" ON public.setter_period_notes
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ops_command'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ops_command'));

DROP POLICY IF EXISTS "Ops Command manages setter review overrides" ON public.setter_review_metric_overrides;
CREATE POLICY "Ops Command manages setter review overrides" ON public.setter_review_metric_overrides
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ops_command'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ops_command'));
