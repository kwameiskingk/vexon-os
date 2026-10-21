CREATE OR REPLACE FUNCTION public.is_valid_active_setter_profile(_setter_profile_id uuid)
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
      ON ur.user_id = sp.user_id
     AND ur.role = 'setter'::public.app_role
    WHERE sp.id = _setter_profile_id
      AND sp.active IS TRUE
      AND COALESCE(sp.is_test_account, false) IS FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_valid_sdr_manager_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_valid_active_setter_profile(NEW.setter_profile_id) THEN
    RAISE EXCEPTION 'SDR manager assignments can only target active non-test users with the setter role';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_valid_sdr_manager_assignment ON public.sdr_manager_assignments;
CREATE TRIGGER trg_enforce_valid_sdr_manager_assignment
BEFORE INSERT OR UPDATE OF setter_profile_id ON public.sdr_manager_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_valid_sdr_manager_assignment();

CREATE OR REPLACE FUNCTION public.cleanup_invalid_sdr_manager_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_ids uuid[];
BEGIN
  IF TG_TABLE_NAME = 'user_roles' THEN
    WITH affected_profiles AS (
      SELECT sp.id
      FROM public.setters_profiles sp
      WHERE sp.user_id = COALESCE(NEW.user_id, OLD.user_id)
    )
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_profile_ids
    FROM affected_profiles;
  ELSE
    v_profile_ids := ARRAY[COALESCE(NEW.id, OLD.id)];
  END IF;

  IF array_length(v_profile_ids, 1) IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  DELETE FROM public.sdr_manager_assignments a
  WHERE a.setter_profile_id = ANY(v_profile_ids)
    AND NOT public.is_valid_active_setter_profile(a.setter_profile_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_invalid_assignments_on_roles ON public.user_roles;
CREATE TRIGGER trg_cleanup_invalid_assignments_on_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_invalid_sdr_manager_assignments();

DROP TRIGGER IF EXISTS trg_cleanup_invalid_assignments_on_setter_profile ON public.setters_profiles;
CREATE TRIGGER trg_cleanup_invalid_assignments_on_setter_profile
AFTER UPDATE OF active, is_test_account, user_id ON public.setters_profiles
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_invalid_sdr_manager_assignments();

DELETE FROM public.sdr_manager_assignments a
WHERE NOT public.is_valid_active_setter_profile(a.setter_profile_id);