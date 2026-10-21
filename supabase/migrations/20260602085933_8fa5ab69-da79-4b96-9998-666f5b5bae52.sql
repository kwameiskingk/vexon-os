-- Stop overloading setters_profiles.active. Remove the trigger that flipped
-- it based on role, and harden visibility via RLS instead.

DROP TRIGGER IF EXISTS sync_setter_profile_active_from_roles_trg ON public.user_roles;
DROP TRIGGER IF EXISTS sync_setter_profile_active_from_roles ON public.user_roles;
DROP FUNCTION IF EXISTS public.sync_setter_profile_active_from_roles() CASCADE;

-- Replace the broad SDR-manager/admin/ops SELECT policy with role-aware ones.
DROP POLICY IF EXISTS "Managers, admins and ops can view all setter profiles" ON public.setters_profiles;

-- HR, admin, dev, ops, finance, CSM, AE, ops_assistant: full read (Employee Hub etc.)
CREATE POLICY "Admin and HR roles can view all setter profiles"
ON public.setters_profiles
FOR SELECT
USING (
  public.is_admin_role(auth.uid())
  OR public.is_hr_role(auth.uid())
  OR public.is_ops_assistant(auth.uid())
);

-- SDR managers: can only see rows whose user actually has the 'setter' role.
-- This prevents leftover setters_profiles rows for non-setters from leaking
-- into SDR-manager views regardless of the `active` flag.
CREATE POLICY "SDR managers can view valid setter profiles only"
ON public.setters_profiles
FOR SELECT
USING (
  public.has_sdr_manager_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = setters_profiles.user_id
      AND ur.role = 'setter'::public.app_role
  )
);