ALTER TABLE public.coaching_sessions DROP CONSTRAINT IF EXISTS coaching_sessions_session_type_check;
ALTER TABLE public.coaching_sessions ADD CONSTRAINT coaching_sessions_session_type_check
  CHECK (session_type = ANY (ARRAY['onboarding'::text, 'weekly_1to1'::text, 'pip_review'::text, 'call_review'::text, 'custom'::text, 'ai_brief'::text]));