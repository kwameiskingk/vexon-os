-- Purge user joshbeaden@meridiansales.example (Closer 2)
DO $$
DECLARE
  uid uuid := 'd1cbb82f-29a0-49c6-8737-4545d555e2e4';
BEGIN
  UPDATE public.meetings SET assigned_ae_id = NULL WHERE assigned_ae_id = uid;
  DELETE FROM public.ae_compensation WHERE user_id = uid;
  DELETE FROM public.user_department_access WHERE user_id = uid;
  DELETE FROM public.user_tab_restrictions WHERE user_id = uid;
  DELETE FROM public.user_roles WHERE user_id = uid;
  DELETE FROM public.profiles WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
END $$;