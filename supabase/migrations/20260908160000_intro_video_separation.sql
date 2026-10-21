-- Explainer video ≠ card video (the owner, 8 Sep 2026). The full-screen intro
-- that plays BEFORE a card now reads its own fields, so a card whose video IS
-- the content ("Watch the recruitment videos") no longer plays that video
-- twice, and Daniel's client explainers sit in their own slot.
--   SDR templates: new columns intro_video_path / intro_video_url.
--   Client steps:  config keys intro_video_path / intro_video_url (jsonb).
-- Data: the eleven client explainers uploaded on 8 Sep were stored as
-- config.video_path (the only slot at the time); they move to
-- intro_video_path. Safe to run twice.

ALTER TABLE public.onboarding_step_templates
  ADD COLUMN IF NOT EXISTS intro_video_path text;
ALTER TABLE public.onboarding_step_templates
  ADD COLUMN IF NOT EXISTS intro_video_url text;

UPDATE public.client_flow_steps
SET config = (config - 'video_path') || jsonb_build_object('intro_video_path', config->>'video_path')
WHERE config ? 'video_path'
  AND coalesce(config->>'intro_video_path', '') = ''
  AND step_key IN ('create_login','onboarding_form','google_workspace','book_onboarding_call','connect_calendar',
                   'pitch_deck','target_companies','reengage','do_not_contact','fee_plans','anything_else');

notify pgrst, 'reload schema';
