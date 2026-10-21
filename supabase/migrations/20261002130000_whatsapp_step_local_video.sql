-- 2 Oct 2026 (the owner): the YouTube owner blocks playback on other sites, so the
-- WhatsApp Business card plays the walkthrough shipped with the app instead
-- (public/onboarding/whatsapp-business-setup.mp4). Site-relative video_path is
-- played as-is by useOnboardingMediaUrl. Safe to run twice.
UPDATE public.onboarding_step_templates
SET video_path = '/onboarding/whatsapp-business-setup.mp4', video_url = NULL
WHERE step_key = 'optimise_whatsapp';

UPDATE public.employee_onboarding_tasks
SET video_url = NULL
WHERE task_key = 'optimise_whatsapp' AND NOT is_completed;
