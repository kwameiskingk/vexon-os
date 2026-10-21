CREATE OR REPLACE VIEW public.setters_profiles_safe AS
SELECT
  sp.id,
  sp.user_id,
  sp.email,
  sp.full_name,
  sp.active,
  sp.created_at,
  sp.department,
  sp.title,
  sp.rival_email,
  sp.rivalry_started_at,
  sp.rivalry_end_pending,
  sp.rivalry_reward_amount,
  sp.rivalry_reward_type,
  sp.rivalry_end_date,
  sp.rivalry_reward_set_by,
  sp.last_rivalry_winner_email,
  sp.last_rivalry_ended_at
FROM public.setters_profiles sp
WHERE sp.active IS TRUE
  AND COALESCE(sp.is_test_account, false) IS FALSE
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = sp.user_id
      AND ur.role = 'setter'::public.app_role
  );

REVOKE EXECUTE ON FUNCTION public.is_valid_active_setter_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_valid_sdr_manager_assignment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_invalid_sdr_manager_assignments() FROM PUBLIC, anon, authenticated;