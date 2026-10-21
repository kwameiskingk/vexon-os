-- SDR onboarding deck + Elena's checklist (3 Sep 2026). the owner's rulings
-- R2/R3/R4/R6/R8/R11 from the 3 Sep design.
--
-- What this does:
--   1. employee_onboarding.start_date (date): the starter's planned first
--      day, set by Elena in the starter sheet / create-starter dialog. The
--      starter's deck shows a countdown chip from it (R6).
--   2. onboarding_step_templates.description and
--      employee_onboarding_tasks.description (text): the conversational intro
--      Elena speaks on each card. Tasks are snapshots, so the seed copies it.
--   3. step_type CHECK on both tables gains 'confirm_email' (the mailbox
--      yes/no card: Yes → type the address → done; No → guidance).
--   4. Upserts the flow to the 3 Sep deck (10 pre-start, 9 day-one cards) by
--      step_key. Authored link_url / video_url / document_path / description
--      already in the builder are PRESERVED (COALESCE). speed_test moves to
--      pre-start; setup_gmail becomes the mailbox card; confirm_close_access
--      becomes "Get set up on Close CRM"; three new Marcus video cards.
--   5. DISABLES (does not delete) join_team_whatsapp, confirm_google_access,
--      confirm_linkedin, confirm_day_one_complete (the finish card replaces
--      it) and setup_close (no Close login pre-start, R2).
--   6. hr_starter_checklist_templates + hr_starter_checklist_items (R8), the
--      five seed items, RLS for admin/dev/ops/hr via has_role.
--
-- SAFE TO RUN TWICE: sections 1, 2, 3, 5 are IF NOT EXISTS / ON CONFLICT /
-- guarded DO blocks. Section 4 (the deck seed) is a ONE-TIME seed: it runs
-- only while the marker step_key 'watch_process_script' is absent, so a
-- second paste, or a paste after Elena has edited the builder, does not
-- overwrite her labels, phases, types or ordering, and does not re-enable
-- steps she disabled in the Dev Center. Starters already onboarding keep
-- the task rows they were seeded with; only NEW profiles get the new deck.
-- The app degrades gracefully before this runs (missing columns read as
-- empty, amber notices in the Dev Center and starter sheet).
--
-- NOTE: applied by the owner via the hosted SQL editor; migration bookkeeping
--       unaware. Never `supabase db push`. Repair list:
--       supabase migration repair --status applied 20260903160000

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. start_date
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.employee_onboarding
  ADD COLUMN IF NOT EXISTS start_date date;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. description on templates and on the seeded task rows
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.onboarding_step_templates
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.employee_onboarding_tasks
  ADD COLUMN IF NOT EXISTS description text;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. step_type CHECK gains 'confirm_email' (templates + tasks)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.onboarding_step_templates'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%step_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.onboarding_step_templates DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.onboarding_step_templates
  ADD CONSTRAINT onboarding_step_templates_step_type_check
  CHECK (step_type IN ('checkoff','link_confirm','question','read_document','upload_proof','confirm_email'));

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.employee_onboarding_tasks'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%step_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.employee_onboarding_tasks DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.employee_onboarding_tasks
  ADD CONSTRAINT employee_onboarding_tasks_step_type_check
  CHECK (step_type IN ('checkoff','link_confirm','question','read_document','upload_proof','confirm_email'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The 3 Sep deck (ONE-TIME seed: upsert by step_key, authored media
--    preserved). Guarded by the marker step 'watch_process_script', which
--    only this seed creates: once it exists the whole section is skipped, so
--    re-running never reverts builder edits or re-enables disabled steps.
-- ═══════════════════════════════════════════════════════════════════════════
DO $seed$
BEGIN
  IF EXISTS (SELECT 1 FROM public.onboarding_step_templates WHERE step_key = 'watch_process_script') THEN
    RAISE NOTICE 'Section 4 skipped: the 3 Sep deck is already seeded (watch_process_script exists).';
    RETURN;
  END IF;

INSERT INTO public.onboarding_step_templates
  (step_key, label, phase, step_type, link_url, video_url, question_prompt, description, sort_order, enabled)
VALUES
  -- ── Before you start ────────────────────────────────────────────────────
  ('setup_gmail', 'Confirm your @meridiansales.example mailbox', 'pre_start', 'confirm_email', NULL, NULL,
   'Have you signed into your new Meridian Sales Partners mailbox and set your password?',
   'Welcome to the team! First things first: your new work email. I''ve sent a Google Workspace invite to your personal inbox. Once you''re in and your password is set, pop the address below.',
   1, true),
  ('watch_dashboard_video', 'Watch: how to set up your dashboard', 'pre_start', 'checkoff', NULL, NULL, NULL,
   'This short video walks you through Vexon OS, the dashboard you''ll live in every day. Watch it through, then tick it off.',
   2, true),
  ('setup_dashboard', 'Sign into your dashboard', 'pre_start', 'checkoff', NULL, NULL, NULL,
   'You''re already here, so this one is easy. Have a look around, then confirm you''re signed in.',
   3, true),
  ('watch_close_video', 'Watch Daniel''s Close CRM video', 'pre_start', 'checkoff', NULL, NULL, NULL,
   'Close is the CRM we call from. Daniel shows you how it''s set up and how we use it. You won''t log in until day one, so just watch for now.',
   4, true),
  ('read_handbook', 'Read the Employee Onboarding Handbook', 'pre_start', 'read_document', NULL, NULL, NULL,
   'Everything about how we work, from hours to holidays. Open the handbook, read it through, then confirm.',
   5, true),
  ('order_headset', 'Order your headset', 'pre_start', 'upload_proof', NULL, NULL, NULL,
   'We reimburse this, so keep the receipt. Upload your order confirmation here.',
   6, true),
  ('optimise_whatsapp', 'Set up WhatsApp Business', 'pre_start', 'checkoff', NULL, NULL, NULL,
   'We use WhatsApp Business to talk to candidates and clients. Set it up on your phone with your work details, then tick this off.',
   7, true),
  ('optimise_linkedin', 'Set up and optimise your LinkedIn profile', 'pre_start', 'question', NULL, NULL,
   'Paste the URL of your updated LinkedIn profile.',
   'Your LinkedIn is the first thing prospects check. Update your headline and role to Meridian Sales Partners, add a clear photo, then paste your profile link below.',
   8, true),
  ('accept_meetings', 'Accept all your Day-1 meeting invitations', 'pre_start', 'link_confirm', 'https://calendar.google.com', NULL, NULL,
   'Your first-day meetings are already in your new calendar. Open Google Calendar, accept every invite, then confirm here.',
   9, true),
  ('speed_test', 'Run a speed test and upload your results', 'pre_start', 'upload_proof', 'https://www.speedtest.net/', NULL, NULL,
   'Calls need a solid connection. Run the test on the machine you''ll work from and upload a screenshot of the result.',
   10, true),
  -- ── Day one ─────────────────────────────────────────────────────────────
  ('attend_hr_morning', 'Attend the morning HR meeting', 'day_one', 'checkoff', NULL, NULL, NULL,
   'Good morning and welcome! We start the day together with HR. Tick this off once the meeting is done.',
   11, true),
  ('attend_manager_1_1', 'Attend your 1-1 with your manager', 'day_one', 'checkoff', NULL, NULL, NULL,
   'Your manager will run through your targets, your first clients and how the week looks. Confirm once you''ve had it.',
   12, true),
  ('confirm_close_access', 'Get set up on Close CRM', 'day_one', 'checkoff', NULL, NULL, NULL,
   'You''ll receive your Close invitation this morning. Accept it, buy your phone number and allow microphone access when your browser asks.',
   13, true),
  ('read_playbook', 'Go through the Fulfilment SDR Playbook', 'day_one', 'read_document', NULL, NULL, NULL,
   'The playbook is how we work a client account end to end. Read it properly; it''s the foundation of everything you''ll do here.',
   14, true),
  ('watch_cold_calling_videos', 'Watch the cold-calling videos', 'day_one', 'checkoff', NULL, NULL, NULL,
   'How we open, handle objections and keep a call moving. Watch them all, then tick this off.',
   15, true),
  ('watch_recruitment_videos', 'Watch the recruitment videos', 'day_one', 'checkoff', NULL, NULL, NULL,
   'A crash course in the recruitment industry: the roles, the jargon and what our clients care about.',
   16, true),
  ('watch_process_script', 'Watch: our script', 'day_one', 'checkoff', NULL, NULL, NULL,
   'Marcus walks you through the script we use on every call and why each line is there.',
   17, true),
  ('watch_process_qualification', 'Watch: how we qualify', 'day_one', 'checkoff', NULL, NULL, NULL,
   'Marcus explains what makes a prospect worth a meeting and the questions that get you there.',
   18, true),
  ('watch_process_booking', 'Watch: how we book meetings', 'day_one', 'checkoff', NULL, NULL, NULL,
   'Marcus shows you how a booking is confirmed, logged and handed over so it actually happens.',
   19, true)
ON CONFLICT (step_key) DO UPDATE SET
  -- First (and only) run: the pre-3 Sep rows are converted to the new deck,
  -- so label / phase / type / order / enabled are taken from the seed.
  label           = EXCLUDED.label,
  phase           = EXCLUDED.phase,
  step_type       = EXCLUDED.step_type,
  question_prompt = COALESCE(EXCLUDED.question_prompt, public.onboarding_step_templates.question_prompt),
  -- Keep anything already authored in the Dev Center builder.
  link_url        = COALESCE(public.onboarding_step_templates.link_url,      EXCLUDED.link_url),
  video_url       = COALESCE(public.onboarding_step_templates.video_url,     EXCLUDED.video_url),
  description     = COALESCE(public.onboarding_step_templates.description,   EXCLUDED.description),
  sort_order      = EXCLUDED.sort_order,
  enabled         = true,
  updated_at      = now();
-- (document_path is not in the VALUES list, so the upsert never touches it.)

-- Sequential ordering means the deck sorts by phase first, then sort_order,
-- so a disabled row's number is irrelevant. Disable, never delete (R4).
UPDATE public.onboarding_step_templates
SET enabled = false, updated_at = now()
WHERE step_key IN (
  'join_team_whatsapp',
  'confirm_google_access',
  'confirm_linkedin',
  'confirm_day_one_complete',
  'setup_close'
) AND enabled = true;

END $seed$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Elena's per-starter checklist (R8)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hr_starter_checklist_templates (
  key        text PRIMARY KEY,
  label      text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  enabled    boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.hr_starter_checklist_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_onboarding_id uuid NOT NULL REFERENCES public.employee_onboarding(id) ON DELETE CASCADE,
  template_key           text NOT NULL,
  label                  text NOT NULL,
  done_at                timestamptz,
  done_by                uuid,
  note                   text,
  UNIQUE (employee_onboarding_id, template_key)
);

CREATE INDEX IF NOT EXISTS hr_starter_checklist_items_onboarding_idx
  ON public.hr_starter_checklist_items (employee_onboarding_id);

INSERT INTO public.hr_starter_checklist_templates (key, label, sort_order, enabled) VALUES
  ('add_to_revolut',    'Added to Revolut',                  1, true),
  ('contract_saved',    'Contract saved to their dashboard', 2, true),
  ('added_to_meetings', 'Added to the team meetings',        3, true),
  ('linkedin_reviewed', 'LinkedIn profile reviewed',         4, true),
  ('whatsapp_reviewed', 'WhatsApp Business reviewed',        5, true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.hr_starter_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_starter_checklist_items     ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_starter_checklist_templates' AND policyname = 'HR tier manages checklist templates') THEN
    CREATE POLICY "HR tier manages checklist templates" ON public.hr_starter_checklist_templates
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role)
          OR public.has_role(auth.uid(), 'ops'::public.app_role)   OR public.has_role(auth.uid(), 'hr'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role)
          OR public.has_role(auth.uid(), 'ops'::public.app_role)   OR public.has_role(auth.uid(), 'hr'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_starter_checklist_items' AND policyname = 'HR tier manages checklist items') THEN
    CREATE POLICY "HR tier manages checklist items" ON public.hr_starter_checklist_items
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role)
          OR public.has_role(auth.uid(), 'ops'::public.app_role)   OR public.has_role(auth.uid(), 'hr'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role)
          OR public.has_role(auth.uid(), 'ops'::public.app_role)   OR public.has_role(auth.uid(), 'hr'::public.app_role));
  END IF;
END $$;

-- Elena (talent acquisition) reaches the starter sheet through the
-- can_screen_candidates capability, not a role, so she needs the same
-- access the TA policies on employee_onboarding grant. Guarded: only if the
-- capability helper exists (it ships with the TA portal migration).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_capability' AND pronamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_starter_checklist_templates' AND policyname = 'TA reads checklist templates') THEN
      EXECUTE $p$CREATE POLICY "TA reads checklist templates" ON public.hr_starter_checklist_templates
        FOR SELECT TO authenticated
        USING (public.has_capability(auth.uid(), 'can_screen_candidates'))$p$;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_starter_checklist_items' AND policyname = 'TA manages checklist items') THEN
      EXECUTE $p$CREATE POLICY "TA manages checklist items" ON public.hr_starter_checklist_items
        FOR ALL TO authenticated
        USING (public.has_capability(auth.uid(), 'can_screen_candidates'))
        WITH CHECK (public.has_capability(auth.uid(), 'can_screen_candidates'))$p$;
    END IF;
  END IF;
END $$;
