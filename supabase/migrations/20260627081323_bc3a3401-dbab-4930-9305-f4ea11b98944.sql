
DO $$
DECLARE
  u uuid := 'e3114ddf-9f66-4d0a-8ffd-0810c65e188a';
  sp uuid := '4076df8b-8607-458c-8f8c-9897b0d3f681';
  cu text := 'user_demo4e22b93a54f7';
  em text := 'staff@meridiansales.example';
BEGIN
  DELETE FROM public.call_scores WHERE setter_id = cu OR setter_id = u::text;
  DELETE FROM public.setter_close_metrics WHERE close_user_id = cu;
  DELETE FROM public.meetings WHERE setter_id = u OR setter_profile_id = sp OR logged_by_setter_id = u OR logged_by_manager_id = u OR assigned_ae_id = u;
  DELETE FROM public.meeting_logs WHERE setter_id = u;
  DELETE FROM public.leads WHERE setter_id = u;
  DELETE FROM public.objection_reports WHERE setter_id = u;
  DELETE FROM public.performance WHERE setter_id = u OR user_id = u::text OR user_id = em;
  DELETE FROM public.performance_history WHERE setter_id = u OR user_id = u::text OR user_id = em;
  DELETE FROM public.setter_client_assignments WHERE setter_id = u OR created_by = u;
  DELETE FROM public.setter_feedback WHERE setter_id = u;
  DELETE FROM public.setter_weekly_goals WHERE created_by = u;
  DELETE FROM public.setter_useful_links WHERE created_by = u;
  DELETE FROM public.setter_onboarding_checklist WHERE setter_profile_id = sp OR manager_user_id = u;
  DELETE FROM public.manual_daily_metrics WHERE target_user_id = u OR entered_by = u;
  DELETE FROM public.daily_metrics WHERE user_id = u;
  DELETE FROM public.sdr_daily_metrics WHERE user_id = u;
  DELETE FROM public.roster_entries WHERE setter_profile_id = sp OR assigned_by = u;
  DELETE FROM public.roster_clients WHERE manager_user_id = u;
  DELETE FROM public.heyreach_reply_actions WHERE setter_user_id = u;
  DELETE FROM public.warm_leads WHERE assigned_setter_id = u OR created_by_user_id = u;
  DELETE FROM public.enrichment_requests WHERE created_by_user_id = u OR email ILIKE em;

  DELETE FROM public.hourly_updates WHERE user_id = u;
  DELETE FROM public.midday_reports WHERE user_id = u;
  DELETE FROM public.start_of_day_submissions WHERE user_id = u;
  DELETE FROM public.responsibility_checkins WHERE user_id = u;
  DELETE FROM public.invoice_submissions WHERE user_id = u;

  DELETE FROM public.employee_attendance WHERE employee_id = u;
  DELETE FROM public.employee_leave_requests WHERE user_id = u;
  DELETE FROM public.employee_documents WHERE user_id = u OR employee_id = u;
  DELETE FROM public.employee_payslips WHERE user_id = u OR employee_id = u OR created_by = u;
  DELETE FROM public.employee_onboarding WHERE user_id = u OR employee_id = u OR assigned_to = u;
  DELETE FROM public.employee_offboarding WHERE employee_profile_id = sp OR initiated_by = u OR employee_email ILIKE em;
  DELETE FROM public.pip_progress_notes WHERE created_by = u;
  DELETE FROM public.pip_records WHERE setter_profile_id = sp;

  DELETE FROM public.user_achievement_progress WHERE user_id = u;
  DELETE FROM public.leaderboard_awards WHERE created_by = u OR email ILIKE em;
  DELETE FROM public.leaderboard_bonuses WHERE created_by = u OR winner_approved_by = u OR winner_email ILIKE em;
  DELETE FROM public.leaderboard_achievements WHERE email ILIKE em;
  DELETE FROM public.recognition_awards WHERE assigned_by = u OR recipient_email ILIKE em;
  DELETE FROM public.pending_badge_proposals WHERE email ILIKE em;

  DELETE FROM public.call_review_briefs WHERE setter_profile_id = sp OR manager_user_id = u;
  DELETE FROM public.coaching_action_items WHERE setter_profile_id = sp OR manager_user_id = u;
  DELETE FROM public.coaching_sessions WHERE setter_profile_id = sp OR manager_user_id = u;
  DELETE FROM public.task_assignments WHERE assigned_user_id = u OR created_by = u;
  DELETE FROM public.task_instances WHERE assigned_to_user_id = u;
  DELETE FROM public.tasks WHERE assigned_to_user_id = u OR created_by_user_id = u;
  DELETE FROM public.post_discovery_feedback WHERE ae_user_id = u;
  DELETE FROM public.post_pitch_call_feedback WHERE ae_user_id = u;

  DELETE FROM public.notifications WHERE recipient_id = u OR triggered_by = u;
  DELETE FROM public.admin_messages WHERE recipient_id = u OR sender_id = u;
  DELETE FROM public.admin_feedback_entries WHERE author_user_id = u;
  DELETE FROM public.dev_ticket_comments WHERE author_id = u;

  DELETE FROM public.user_department_access WHERE user_id = u;
  DELETE FROM public.user_tab_restrictions WHERE user_id = u;
  DELETE FROM public.sdr_manager_assignments WHERE manager_user_id = u OR setter_profile_id = sp OR assigned_by = u;
  DELETE FROM public.ae_compensation WHERE user_id = u;
  DELETE FROM public.ae_metrics_overrides WHERE ae_user_id = u OR created_by = u;
  DELETE FROM public.user_roles WHERE user_id = u;

  UPDATE public.setters_profiles SET rival_email = NULL WHERE rival_email ILIKE em;
  UPDATE public.setters_profiles SET last_rivalry_winner_email = NULL WHERE last_rivalry_winner_email ILIKE em;

  DELETE FROM public.setters_profiles WHERE id = sp;
  DELETE FROM public.client_profile_users WHERE user_id = u;
  DELETE FROM public.profiles WHERE id = u;

  DELETE FROM auth.users WHERE id = u;
END $$;
