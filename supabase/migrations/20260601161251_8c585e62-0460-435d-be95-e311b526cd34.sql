
UPDATE public.setters_profiles sp
SET active = false
WHERE sp.active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE LOWER(p.email) = LOWER(sp.email)
      AND ur.role = 'setter'::app_role
  );

CREATE OR REPLACE FUNCTION public.sync_setter_profile_active_from_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email   text;
  v_is_setter boolean;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT LOWER(email) INTO v_email FROM public.profiles WHERE id = v_user_id;
  IF v_email IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND role = 'setter'::app_role
  ) INTO v_is_setter;

  UPDATE public.setters_profiles
  SET active = v_is_setter
  WHERE LOWER(email) = v_email
    AND active IS DISTINCT FROM v_is_setter;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_sync_setter_active ON public.user_roles;
CREATE TRIGGER trg_user_roles_sync_setter_active
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.sync_setter_profile_active_from_roles();
