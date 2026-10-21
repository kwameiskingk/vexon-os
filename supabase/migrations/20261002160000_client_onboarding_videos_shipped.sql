-- 2 Oct 2026 (Marcus: "embedded so it's just instant"): Daniel's client
-- onboarding videos ship with the app at 720p (public/onboarding/client/*),
-- played straight from the CDN with preload, no signed URL round trip. The
-- welcome card gets Daniel's clean intro (no login section). Cards Daniel is
-- re-recording stay without a video until the new files arrive. Safe to run
-- twice.
UPDATE public.client_flow_steps s
SET config = coalesce(s.config, '{}'::jsonb) || jsonb_build_object('intro_video_path', v.path)
FROM (VALUES
  ('create_login',     '/onboarding/client/welcome.mp4'),
  ('onboarding_form',  '/onboarding/client/onboarding-form.mp4'),
  ('google_workspace', '/onboarding/client/team-mailbox.mp4'),
  ('connect_calendar', '/onboarding/client/connect-calendar.mp4'),
  ('pitch_deck',       '/onboarding/client/pitch-deck.mp4'),
  ('do_not_contact',   '/onboarding/client/do-not-contact.mp4')
) AS v(step_key, path)
WHERE s.step_key = v.step_key;
