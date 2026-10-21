-- Purge Hannah Reid entirely
DO $$
DECLARE
  v_user_id uuid := '344adadd-9fb8-4a18-8baa-27439ce040ea';
  v_setter_id uuid := '37a7b089-e4d1-4f92-85ad-f28d1412b006';
  v_email text := 'hannah@meridiansales.example';
BEGIN
  -- Setter-scoped data
  DELETE FROM public.meetings WHERE setter_id = v_setter_id;
  DELETE FROM public.performance WHERE setter_id = v_setter_id;
  DELETE FROM public.performance_history WHERE setter_id = v_setter_id;
  DELETE FROM public.invoice_submissions WHERE setter_id = v_setter_id;
  DELETE FROM public.setter_client_assignments WHERE setter_id = v_setter_id;
  DELETE FROM public.setter_weekly_goals WHERE setter_id = v_setter_id;
  DELETE FROM public.setter_feedback WHERE setter_id = v_setter_id;
  DELETE FROM public.setter_onboarding_checklist WHERE setter_id = v_setter_id;
  DELETE FROM public.setter_close_metrics WHERE setter_id = v_setter_id;
  DELETE FROM public.sdr_daily_metrics WHERE setter_id = v_setter_id;
  DELETE FROM public.sdr_manager_assignments WHERE setter_id = v_setter_id;
  DELETE FROM public.roster_entries WHERE setter_id = v_setter_id;
  DELETE FROM public.manual_daily_metrics WHERE setter_id = v_setter_id;
  DELETE FROM public.daily_metrics WHERE setter_id = v_setter_id;
  DELETE FROM public.start_of_day_submissions WHERE setter_id = v_setter_id;
  DELETE FROM public.hourly_updates WHERE setter_id = v_setter_id;
  DELETE FROM public.midday_reports WHERE setter_id = v_setter_id;
  DELETE FROM public.objection_reports WHERE setter_id = v_setter_id;
  DELETE FROM public.coaching_sessions WHERE setter_id = v_setter_id;
  DELETE FROM public.coaching_action_items WHERE setter_id = v_setter_id;
  DELETE FROM public.pip_records WHERE setter_id = v_setter_id;
  DELETE FROM public.leaderboard_awards WHERE setter_id = v_setter_id;
  DELETE FROM public.leaderboard_achievements WHERE setter_id = v_setter_id;
  DELETE FROM public.leaderboard_bonuses WHERE setter_id = v_setter_id;
  DELETE FROM public.user_achievement_progress WHERE user_id = v_setter_id OR user_id = v_user_id;

  -- User/auth-scoped data
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  DELETE FROM public.user_department_access WHERE user_id = v_user_id;
  DELETE FROM public.user_tab_restrictions WHERE user_id = v_user_id;
  DELETE FROM public.notifications WHERE user_id = v_user_id;
  DELETE FROM public.employee_attendance WHERE user_id = v_user_id;
  DELETE FROM public.employee_leave_requests WHERE user_id = v_user_id;
  DELETE FROM public.employee_documents WHERE user_id = v_user_id;
  DELETE FROM public.employee_payslips WHERE user_id = v_user_id;
  DELETE FROM public.task_assignments WHERE user_id = v_user_id;
  DELETE FROM public.task_instances WHERE user_id = v_user_id;
  DELETE FROM public.responsibility_checkins WHERE user_id = v_user_id;
  DELETE FROM public.admin_messages WHERE from_user_id = v_user_id OR to_user_id = v_user_id;

  -- Profiles
  DELETE FROM public.setters_profiles WHERE id = v_setter_id OR user_id = v_user_id OR LOWER(email) = v_email;
  DELETE FROM public.profiles WHERE id = v_user_id OR LOWER(email) = v_email;

  -- Auth user (cascades remaining FKs)
  DELETE FROM auth.users WHERE id = v_user_id;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  RAISE NOTICE 'Skipping nonexistent column/table: %', SQLERRM;
END $$;