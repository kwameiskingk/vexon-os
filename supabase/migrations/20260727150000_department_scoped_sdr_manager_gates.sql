-- Department-scoped SDR-manager gates (Batch 2, 2026-07-27).
--
-- The 20260721 sdr_manager RLS hardcoded fulfilment (is_genuine_fulfilment_setter /
-- is_active_genuine_fulfilment_setter). With an acquisition SDR manager now live
-- (Felix), those gates must follow the MANAGER'S department instead:
--   * employee_attendance (4 policies) — mark/view attendance for own-department setters
--   * user_roles setter-picker policy — role checks (filterToSetterRoleIds) for own-dept setters
--   * performance_reviews (3) + performance_review_briefs (1) — reviews for own-dept setters
--
-- Manager department comes from sdr_manager_departments(auth.uid()) (existing fn:
-- distinct departments of the manager's sdr_manager_assignments). A manager with no
-- assignments gets an empty array -> fail-closed. Fulfilment managers' effective
-- permissions are UNCHANGED (their array is exactly {fulfilment}).
--
-- The old fulfilment-specific functions are deliberately left in place (other
-- consumers may exist); only the policies below stop using them.

-- 1) Department-parameterised genuine-setter checks (mirror the fulfilment originals).
CREATE OR REPLACE FUNCTION public.is_genuine_setter_in_departments(_user_id uuid, _departments text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.setters_profiles sp
    JOIN public.user_roles ur
      ON ur.user_id = sp.user_id AND ur.role = 'setter'
    WHERE sp.user_id = _user_id
      AND sp.department = ANY(_departments)
      AND COALESCE(sp.is_test_account, false) = false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_genuine_setter_in_departments(_user_id uuid, _departments text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.setters_profiles sp
    JOIN public.user_roles ur
      ON ur.user_id = sp.user_id AND ur.role = 'setter'
    WHERE sp.user_id = _user_id
      AND sp.department = ANY(_departments)
      AND COALESCE(sp.is_test_account, false) = false
      AND sp.active = true
  );
$$;

-- 2) employee_attendance: fulfilment literal -> manager's departments.
DROP POLICY IF EXISTS "SDR manager views fulfilment setter attendance" ON public.employee_attendance;
CREATE POLICY "SDR manager views managed-department setter attendance"
  ON public.employee_attendance FOR SELECT
  USING (
    has_sdr_manager_role(auth.uid())
    AND employee_id <> auth.uid()
    AND is_active_genuine_setter_in_departments(employee_id, sdr_manager_departments(auth.uid()))
  );

DROP POLICY IF EXISTS "SDR manager marks fulfilment setter attendance" ON public.employee_attendance;
CREATE POLICY "SDR manager marks managed-department setter attendance"
  ON public.employee_attendance FOR INSERT
  WITH CHECK (
    has_sdr_manager_role(auth.uid())
    AND employee_id <> auth.uid()
    AND is_active_genuine_setter_in_departments(employee_id, sdr_manager_departments(auth.uid()))
  );

DROP POLICY IF EXISTS "SDR manager updates non-ops fulfilment attendance" ON public.employee_attendance;
CREATE POLICY "SDR manager updates non-ops managed-department attendance"
  ON public.employee_attendance FOR UPDATE
  USING (
    has_sdr_manager_role(auth.uid())
    AND employee_id <> auth.uid()
    AND is_active_genuine_setter_in_departments(employee_id, sdr_manager_departments(auth.uid()))
    AND marked_by_role IS DISTINCT FROM 'ops'
  );

DROP POLICY IF EXISTS "SDR manager clears non-ops fulfilment attendance" ON public.employee_attendance;
CREATE POLICY "SDR manager clears non-ops managed-department attendance"
  ON public.employee_attendance FOR DELETE
  USING (
    has_sdr_manager_role(auth.uid())
    AND employee_id <> auth.uid()
    AND is_active_genuine_setter_in_departments(employee_id, sdr_manager_departments(auth.uid()))
    AND marked_by_role IS DISTINCT FROM 'ops'
  );

-- 3) user_roles setter picker: without this, filterToSetterRoleIds() returns
-- nothing for acquisition managers and every roster built on it zeroes out.
DROP POLICY IF EXISTS "SDR manager views fulfilment setter roles" ON public.user_roles;
CREATE POLICY "SDR manager views managed-department setter roles"
  ON public.user_roles FOR SELECT
  USING (
    has_sdr_manager_role(auth.uid())
    AND role = 'setter'
    AND user_id <> auth.uid()
    AND is_active_genuine_setter_in_departments(user_id, sdr_manager_departments(auth.uid()))
  );

-- 4) performance_reviews + briefs: reviews for the manager's own department.
DROP POLICY IF EXISTS "SDR manager creates fulfilment setter reviews" ON public.performance_reviews;
CREATE POLICY "SDR manager creates managed-department setter reviews"
  ON public.performance_reviews FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'sdr_manager'::app_role)
    AND created_by = auth.uid()
    AND reviewee_user_id <> auth.uid()
    AND is_genuine_setter_in_departments(reviewee_user_id, sdr_manager_departments(auth.uid()))
  );

DROP POLICY IF EXISTS "SDR manager updates fulfilment setter reviews" ON public.performance_reviews;
CREATE POLICY "SDR manager updates managed-department setter reviews"
  ON public.performance_reviews FOR UPDATE
  USING (
    has_role(auth.uid(), 'sdr_manager'::app_role)
    AND reviewee_user_id <> auth.uid()
    AND is_genuine_setter_in_departments(reviewee_user_id, sdr_manager_departments(auth.uid()))
  );

DROP POLICY IF EXISTS "SDR manager views fulfilment setter reviews" ON public.performance_reviews;
CREATE POLICY "SDR manager views managed-department setter reviews"
  ON public.performance_reviews FOR SELECT
  USING (
    has_role(auth.uid(), 'sdr_manager'::app_role)
    AND reviewee_user_id <> auth.uid()
    AND is_genuine_setter_in_departments(reviewee_user_id, sdr_manager_departments(auth.uid()))
  );

DROP POLICY IF EXISTS "SDR manager views fulfilment setter review briefs" ON public.performance_review_briefs;
CREATE POLICY "SDR manager views managed-department setter review briefs"
  ON public.performance_review_briefs FOR SELECT
  USING (
    has_role(auth.uid(), 'sdr_manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.performance_reviews r
      WHERE r.id = performance_review_briefs.review_id
        AND r.reviewee_user_id <> auth.uid()
        AND is_genuine_setter_in_departments(r.reviewee_user_id, sdr_manager_departments(auth.uid()))
    )
  );
