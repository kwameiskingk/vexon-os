-- ═══════════════════════════════════════════════════════════════════════════
-- SDR onboarding: "Upload your profile photo" card (13 Oct 2026, the owner).
--
--   1. step_type CHECK on both tables gains 'profile_photo'.
--   2. The live flow (onboarding_step_templates) gets the card, pre-start,
--      straight after the speed test (sort_order 11; phase sorts first so it
--      never collides with day-one's 11). Guarded: inserted once.
--   3. HR roles (admin/dev/ops/hr via is_hr_role) can READ starters' proof
--      files in onboarding-assets, so the Employee Hub Documents tab can
--      list and download them. Until now only admin/dev and the TA
--      capability could; a plain hr/ops login got "could not be opened".
--
-- Safe to re-run: every statement is guarded.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Vocabulary -------------------------------------------------------------
ALTER TABLE public.onboarding_step_templates
  DROP CONSTRAINT IF EXISTS onboarding_step_templates_step_type_check;
ALTER TABLE public.onboarding_step_templates
  ADD CONSTRAINT onboarding_step_templates_step_type_check
  CHECK (step_type IN ('checkoff','link_confirm','question','read_document','upload_proof','confirm_email','quiz','profile_photo'));

ALTER TABLE public.employee_onboarding_tasks
  DROP CONSTRAINT IF EXISTS employee_onboarding_tasks_step_type_check;
ALTER TABLE public.employee_onboarding_tasks
  ADD CONSTRAINT employee_onboarding_tasks_step_type_check
  CHECK (step_type IN ('checkoff','link_confirm','question','read_document','upload_proof','confirm_email','quiz','profile_photo'));

-- 2. The card in the live flow -----------------------------------------------
INSERT INTO public.onboarding_step_templates
  (step_key, label, phase, step_type, link_url, video_url, question_prompt, sort_order, enabled, description, done_label)
SELECT
  'upload_profile_photo',
  'Upload your profile photo',
  'pre_start',
  'profile_photo',
  NULL, NULL, NULL,
  11,
  true,
  'You are required to upload a professional headshot before your first day. We use it for your Google Workspace account, your email signature and your Vexon OS profile, so it must be a clear, recent, front-facing photograph of you alone, on a plain background, in work-appropriate clothing. No group photos, no filters, no sunglasses, no cropped-out people. This is a condition of starting with us.',
  'Profile photo uploaded'
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_step_templates WHERE step_key = 'upload_profile_photo');

-- 3. HR reads proof files ------------------------------------------------------
DROP POLICY IF EXISTS "HR roles read onboarding proof" ON storage.objects;
CREATE POLICY "HR roles read onboarding proof" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'onboarding-assets' AND name LIKE 'proof/%' AND public.is_hr_role(auth.uid()));

-- Verification ----------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.onboarding_step_templates WHERE step_key = 'upload_profile_photo' AND enabled) AS card_rows,
  (SELECT pg_get_constraintdef(oid) LIKE '%profile_photo%' FROM pg_constraint WHERE conname = 'onboarding_step_templates_step_type_check') AS templates_check_ok,
  (SELECT pg_get_constraintdef(oid) LIKE '%profile_photo%' FROM pg_constraint WHERE conname = 'employee_onboarding_tasks_step_type_check') AS tasks_check_ok,
  (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='HR roles read onboarding proof') AS hr_policy_ok;
