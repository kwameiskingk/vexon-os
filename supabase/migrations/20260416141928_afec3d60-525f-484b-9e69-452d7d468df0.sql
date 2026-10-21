
-- Allow ops_assistant to read setters_profiles
DROP POLICY IF EXISTS "Setters, SDR managers and admins can view setter profiles" ON public.setters_profiles;
CREATE POLICY "Setters, SDR managers, admins and ops assistant can view setter profiles"
  ON public.setters_profiles FOR SELECT
  USING (
    has_role(auth.uid(), 'setter'::app_role) OR
    has_role(auth.uid(), 'sdr_manager'::app_role) OR
    is_admin_role(auth.uid()) OR
    is_ops_assistant(auth.uid())
  );

-- Allow ops_assistant to read user_roles (needed to look up AEs, SDR managers, etc.)
CREATE POLICY "Ops assistant can view all roles"
  ON public.user_roles FOR SELECT
  USING (is_ops_assistant(auth.uid()));
