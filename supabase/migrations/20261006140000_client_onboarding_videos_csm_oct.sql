-- Client onboarding: Daniel's re-recorded videos (6 Oct 2026). Files ship
-- with the app under public/onboarding/client at 720p. Safe to run twice.
--
--   card 5  book_onboarding_call  "OB - NEW OB Call Explanation"
--   card 9  fee_plans             "OB - NEW Fees" (Standardised terms)
--   card 10 anything_else         "OB - NEW Upload and Goodbye", 0:00-0:24
--   finish  client_flow_settings  "OB - NEW Upload and Goodbye", 0:24-1:04,
--                                 plays as "Onboarding complete" before the
--                                 finish card (Daniel: "card 10 and after")
--
-- To keep the finish card empty instead, skip the last statement.

UPDATE public.client_flow_steps s
SET config = coalesce(s.config, '{}'::jsonb) || jsonb_build_object('intro_video_path', v.path)
FROM (VALUES
  ('book_onboarding_call', '/onboarding/client/onboarding-call.mp4'),
  ('fee_plans',            '/onboarding/client/standardised-terms.mp4'),
  ('anything_else',        '/onboarding/client/upload-anything.mp4')
) AS v(step_key, path)
WHERE s.step_key = v.step_key;

UPDATE public.client_flow_settings
SET finish_video_path = '/onboarding/client/goodbye.mp4', finish_video_url = NULL, updated_at = now()
WHERE id = 1;
