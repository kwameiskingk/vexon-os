-- 2 Oct 2026 (the owner): the "Set up WhatsApp Business" onboarding card plays the
-- setup walkthrough (YouTube embed) and tells the starter to watch it first.
-- Updates the flow template and every starter's still-open copy of the card.
-- Safe to run twice.
UPDATE public.onboarding_step_templates
SET video_url = 'https://youtu.be/qCPY74N5k84',
    description = 'We use WhatsApp Business to communicate with candidates and clients. Watch the video, install WhatsApp Business on your phone and complete your profile with your work details, then mark this card as complete.'
WHERE step_key = 'optimise_whatsapp';

UPDATE public.employee_onboarding_tasks
SET video_url = 'https://youtu.be/qCPY74N5k84',
    description = 'We use WhatsApp Business to communicate with candidates and clients. Watch the video, install WhatsApp Business on your phone and complete your profile with your work details, then mark this card as complete.'
WHERE task_key = 'optimise_whatsapp' AND NOT is_completed;
