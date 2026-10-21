-- Acquisition SDR manager manages the AE bench (Felix -> Rory Carter, Oliver Grant)
-- Approved 2026-07-29. AEs hold role account_executive with setters_profiles rows
-- in department 'sales' (active, non-test). The sdr_manager attendance policies
-- gate on is_active_genuine_setter_in_departments (setter role only), and the
-- sdr_manager reads of setters_profiles / user_roles are scoped to setter rows
-- in sdr_manager_departments() = {acquisition} — so AEs were invisible to the
-- acquisition manager at all three layers. Per the standing org ruling (a manager
-- runs their entire department), an acquisition SDR manager also sees and marks
-- the AE bench. Fulfilment managers are unaffected: sdr_manager_manages_aes()
-- is false for them (their departments array is exactly {fulfilment}).
-- Ops-authority rule preserved: ops-marked rows stay locked (marked_by_role guard).
-- NOTE: applied via the hosted builder SQL 2026-07-29; migration bookkeeping unaware.
--       Never `supabase db push` this file. Add to the repair list:
--       supabase migration repair --status applied 20260729120000

-- 1) Does this manager manage the AE bench? (acquisition managers only)
CREATE OR REPLACE FUNCTION public.sdr_manager_manages_aes(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'acquisition' = ANY (public.sdr_manager_departments(_user));
$$;

-- 2) Is this user a genuine, active AE? (mirrors is_active_genuine_setter_in_departments)
CREATE OR REPLACE FUNCTION public.is_active_genuine_ae(_user_id uuid)
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
      ON ur.user_id = sp.user_id AND ur.role = 'account_executive'
    WHERE sp.user_id = _user_id
      AND sp.department = 'sales'
      AND COALESCE(sp.is_test_account, false) = false
      AND sp.active = true
  );
$$;

-- 3) The manager's client must be able to read the AE bench rows the roster is built from.
CREATE POLICY "SDR manager views managed AE profiles"
  ON public.setters_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.has_sdr_manager_role(auth.uid())
    AND public.sdr_manager_manages_aes(auth.uid())
    AND department = 'sales'
  );

CREATE POLICY "SDR manager views AE roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    public.has_sdr_manager_role(auth.uid())
    AND public.sdr_manager_manages_aes(auth.uid())
    AND role = 'account_executive'
  );

-- 4) employee_attendance: same four grants the manager already has for setters,
--    including the ops-mark protection on update/delete.
CREATE POLICY "SDR manager views managed AE attendance"
  ON public.employee_attendance
  FOR SELECT
  TO authenticated
  USING (
    public.has_sdr_manager_role(auth.uid())
    AND employee_id <> auth.uid()
    AND public.sdr_manager_manages_aes(auth.uid())
    AND public.is_active_genuine_ae(employee_id)
  );

CREATE POLICY "SDR manager marks managed AE attendance"
  ON public.employee_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_sdr_manager_role(auth.uid())
    AND employee_id <> auth.uid()
    AND public.sdr_manager_manages_aes(auth.uid())
    AND public.is_active_genuine_ae(employee_id)
  );

CREATE POLICY "SDR manager updates non-ops managed AE attendance"
  ON public.employee_attendance
  FOR UPDATE
  TO authenticated
  USING (
    public.has_sdr_manager_role(auth.uid())
    AND employee_id <> auth.uid()
    AND public.sdr_manager_manages_aes(auth.uid())
    AND public.is_active_genuine_ae(employee_id)
    AND (marked_by_role IS DISTINCT FROM 'ops'::text)
  );

CREATE POLICY "SDR manager clears non-ops managed AE attendance"
  ON public.employee_attendance
  FOR DELETE
  TO authenticated
  USING (
    public.has_sdr_manager_role(auth.uid())
    AND employee_id <> auth.uid()
    AND public.sdr_manager_manages_aes(auth.uid())
    AND public.is_active_genuine_ae(employee_id)
    AND (marked_by_role IS DISTINCT FROM 'ops'::text)
  );
