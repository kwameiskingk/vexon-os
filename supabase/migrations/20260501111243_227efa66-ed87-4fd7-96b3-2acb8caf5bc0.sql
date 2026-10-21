-- Purge Jiveshni Moodley and Amir Haddad
DELETE FROM public.sdr_manager_assignments
  WHERE setter_profile_id IN (SELECT id FROM public.setters_profiles WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3'));
DELETE FROM public.setter_client_assignments
  WHERE setter_id IN (SELECT id FROM public.setters_profiles WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3'));
DELETE FROM public.roster_entries
  WHERE setter_profile_id IN (SELECT id FROM public.setters_profiles WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3'));

DELETE FROM public.user_roles WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.user_department_access WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.user_tab_restrictions WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.notifications WHERE recipient_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.audit_logs WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.meetings WHERE setter_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3')
   OR logged_by_setter_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.start_of_day_submissions WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.midday_reports WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.objection_reports WHERE setter_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.employee_leave_requests WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.employee_attendance WHERE employee_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.task_instances WHERE assigned_to_user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.user_achievement_progress WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.leaderboard_achievements WHERE LOWER(email) IN ('jiveshni@meridiansales.example','faizelh@meridiansales.example');

DELETE FROM public.setters_profiles WHERE user_id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');
DELETE FROM public.profiles WHERE id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');

DELETE FROM auth.users WHERE id IN ('4a9c8e24-a973-488a-863d-a5b655b6de31','0f523fb7-f661-4da8-8898-a3644210adf3');