-- Purge Jiveshni Moodley and Amir Haddad from the application
-- User IDs:
--   4a9c8e24-a973-488a-863d-a5b655b6de31  Jiveshni Moodley
--   0f523fb7-f661-4da8-8898-a3644210adf3  Amir Haddad

DO $$
DECLARE
  uids uuid[] := ARRAY[
    '4a9c8e24-a973-488a-863d-a5b655b6de31'::uuid,
    '0f523fb7-f661-4da8-8898-a3644210adf3'::uuid
  ];
  setter_profile_ids uuid[];
BEGIN
  -- Capture setter profile ids for these users (used by FK references elsewhere)
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO setter_profile_ids
  FROM public.setters_profiles WHERE user_id = ANY(uids);

  -- Setter-profile-scoped data
  IF array_length(setter_profile_ids, 1) IS NOT NULL THEN
    DELETE FROM public.sdr_manager_assignments WHERE setter_profile_id = ANY(setter_profile_ids);
    DELETE FROM public.client_assignments WHERE setter_profile_id = ANY(setter_profile_ids);
    DELETE FROM public.setter_roster_entries WHERE setter_profile_id = ANY(setter_profile_ids);
  END IF;

  -- User-id-scoped data across known tables (best-effort, ignore missing tables)
  DELETE FROM public.user_roles WHERE user_id = ANY(uids);
  DELETE FROM public.user_department_access WHERE user_id = ANY(uids);
  DELETE FROM public.user_tab_restrictions WHERE user_id = ANY(uids);
  DELETE FROM public.notifications WHERE user_id = ANY(uids);
  DELETE FROM public.audit_logs WHERE user_id = ANY(uids);
  DELETE FROM public.meetings WHERE setter_id = ANY(uids);
  DELETE FROM public.eod_submissions WHERE user_id = ANY(uids);
  DELETE FROM public.start_of_day_submissions WHERE user_id = ANY(uids);
  DELETE FROM public.midday_reports WHERE user_id = ANY(uids);
  DELETE FROM public.objection_reports WHERE user_id = ANY(uids);
  DELETE FROM public.leave_requests WHERE user_id = ANY(uids);
  DELETE FROM public.attendance_logs WHERE user_id = ANY(uids);
  DELETE FROM public.task_instances WHERE assigned_to = ANY(uids);
  DELETE FROM public.achievements WHERE user_id = ANY(uids);

  -- Setter profile + base profile
  DELETE FROM public.setters_profiles WHERE user_id = ANY(uids);
  DELETE FROM public.profiles WHERE id = ANY(uids);

  -- Auth user (last)
  DELETE FROM auth.users WHERE id = ANY(uids);
EXCEPTION WHEN undefined_table THEN
  -- Some optional tables may not exist; log and continue
  RAISE NOTICE 'Skipped missing table during purge: %', SQLERRM;
END $$;