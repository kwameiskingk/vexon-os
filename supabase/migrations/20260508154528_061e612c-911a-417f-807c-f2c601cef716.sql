
INSERT INTO public.performance (email, date, setter_id, user_id, dials_made, call_duration_seconds, talk_time, conversations, updated_at)
SELECT
  LOWER(sp.email) AS email,
  scm.date,
  sp.user_id AS setter_id,
  sp.user_id AS user_id,
  scm.dials,
  scm.talk_time_seconds,
  ROUND(COALESCE(scm.talk_time_seconds, 0)::numeric / 60)::int AS talk_time,
  scm.connects,
  now()
FROM public.setter_close_metrics scm
JOIN public.setters_profiles sp ON sp.close_user_id = scm.close_user_id
WHERE scm.date = CURRENT_DATE
  AND sp.email IS NOT NULL
  AND sp.user_id IS NOT NULL
ON CONFLICT (setter_id, date) DO UPDATE SET
  dials_made = EXCLUDED.dials_made,
  call_duration_seconds = EXCLUDED.call_duration_seconds,
  talk_time = EXCLUDED.talk_time,
  conversations = EXCLUDED.conversations,
  updated_at = now();
