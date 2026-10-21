-- Department-scoped visibility on setters_profiles.
-- Fulfilment SDR manager sees only fulfilment setters; acquisition SDR manager (when added) sees only acquisition setters.
-- Fulfilment setters see other fulfilment setters only; acquisition setters see other acquisition setters only.

-- Helper: which department(s) does this user manage as an SDR manager?
CREATE OR REPLACE FUNCTION public.sdr_manager_departments(_user uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT department), ARRAY[]::text[])
  FROM public.sdr_manager_assignments
  WHERE manager_user_id = _user
    AND department IS NOT NULL
$$;

-- Helper: what is this user's own setter department?
CREATE OR REPLACE FUNCTION public.current_setter_department(_user uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department
  FROM public.setters_profiles
  WHERE user_id = _user
  LIMIT 1
$$;

-- Replace SDR-manager SELECT policy with department-scoped one.
DROP POLICY IF EXISTS "SDR managers can view valid setter profiles only" ON public.setters_profiles;

CREATE POLICY "SDR managers view setters in their departments"
ON public.setters_profiles
FOR SELECT
USING (
  public.has_sdr_manager_role(auth.uid())
  AND department = ANY (public.sdr_manager_departments(auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = setters_profiles.user_id
      AND ur.role = 'setter'::public.app_role
  )
);

-- Setters: see other setters in the same department (powers leaderboard/team views).
-- The pre-existing "Setters can view their own profile" policy stays as a safety net.
CREATE POLICY "Setters view same-department setters"
ON public.setters_profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'setter'::public.app_role
  )
  AND department IS NOT NULL
  AND department = public.current_setter_department(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = setters_profiles.user_id
      AND ur2.role = 'setter'::public.app_role
  )
);