DROP POLICY IF EXISTS "SDR managers view setters in their departments" ON public.setters_profiles;
DROP POLICY IF EXISTS "Setters view same-department setters" ON public.setters_profiles;

CREATE POLICY "SDR managers view setters in their departments"
ON public.setters_profiles
FOR SELECT
USING (
  public.has_sdr_manager_role(auth.uid())
  AND department IS NOT NULL
  AND department = ANY (public.sdr_manager_departments(auth.uid()))
  AND public.has_role(setters_profiles.user_id, 'setter'::public.app_role)
);

CREATE POLICY "Setters view same-department setters"
ON public.setters_profiles
FOR SELECT
USING (
  public.has_role(auth.uid(), 'setter'::public.app_role)
  AND department IS NOT NULL
  AND department = public.current_setter_department(auth.uid())
  AND public.has_role(setters_profiles.user_id, 'setter'::public.app_role)
);