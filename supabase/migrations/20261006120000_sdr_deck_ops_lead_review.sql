-- SDR onboarding deck after the owner and Elena's review (6 Oct 2026, "Dashboard
-- Catch Up"). Safe to run twice.
--
-- Cards removed (disabled, never deleted, so completed history stays):
--   2  watch_close_video            setters log in to Close on day one, not before
--   11 read_playbook                Elena: "I must delete this"
--   14 watch_process_script         Marcus covers script, qualification and
--   15 watch_process_qualification  booking in a meeting with each new starter
--   16 watch_process_booking        before they start calling
--   17 week_one_itinerary           copy was wrong; Elena: "let's just delete it"
--
-- Videos (files ship with the app under public/onboarding/sdr, 720p):
--   10 confirm_close_access      Jordan's Close walkthrough
--   13 watch_recruitment_videos  Marcus's "Learning about recruitment agencies"
--                                call replaces the YouTube explainer
--
-- Card 12 "Watch the cold-calling videos" plays as six modules of Grant
-- Cardone videos; the modules live in src/lib/sdrTrainingModules.ts.
--
-- No starter has an open onboarding today (checked 6 Oct), so no per-starter
-- task rows need tidying.

UPDATE public.onboarding_step_templates
SET enabled = false, updated_at = now()
WHERE step_key IN (
  'watch_close_video',
  'read_playbook',
  'watch_process_script',
  'watch_process_qualification',
  'watch_process_booking',
  'week_one_itinerary'
) AND enabled = true;

UPDATE public.onboarding_step_templates t
SET video_path = v.path, video_url = NULL, updated_at = now()
FROM (VALUES
  ('confirm_close_access',     '/onboarding/sdr/setup-close-crm.mp4'),
  ('watch_recruitment_videos', '/onboarding/sdr/learning-about-recruitment-agencies.mp4')
) AS v(step_key, path)
WHERE t.step_key = v.step_key
  AND t.video_path IS DISTINCT FROM v.path;

-- Copy (the owner, 6 Oct, while walking the sandbox). "{first_name}" is filled
-- in with the starter's first name by the deck.
UPDATE public.onboarding_step_templates
SET description = v.description, updated_at = now()
FROM (VALUES
  ('attend_hr_morning', 'Good morning and welcome back, {first_name}. Your first day begins with a short meeting with HR. Once that meeting is complete, please mark this task as complete and continue to the next.'),
  ('watch_cold_calling_videos', 'Six modules from Grant Cardone''s Mastering the Cold Call. Work through them in order: each module unlocks once you have watched every video in the one before. When all six are done, mark this card as complete.')
) AS v(step_key, description)
WHERE public.onboarding_step_templates.step_key = v.step_key
  AND public.onboarding_step_templates.description IS DISTINCT FROM v.description;
