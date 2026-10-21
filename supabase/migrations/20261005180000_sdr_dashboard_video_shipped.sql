-- 5 Oct 2026 (the owner): the Vexon OS explainer (George's draft v2, 7m52s) ships
-- with the app at 720p as public/onboarding/vexon-explainer.mp4 and plays
-- as the last day-one card, "Watch: getting around your dashboard", the same
-- way as the WhatsApp card. Site-relative video_path is played as-is by
-- useOnboardingMediaUrl. The live template row beats the code template key
-- by key, so it must carry the path too. Safe to run twice.
UPDATE public.onboarding_step_templates
SET video_path = '/onboarding/vexon-explainer.mp4', video_url = NULL
WHERE step_key = 'watch_dashboard_video';

UPDATE public.employee_onboarding_tasks
SET video_url = NULL
WHERE task_key = 'watch_dashboard_video' AND NOT is_completed;
