-- Onboarding refinement (7 Sep 2026). Marcus's 4 Sep review of both decks,
-- relayed by the owner on 7 Sep.
--
-- What this does:
--   1. Copy sweep: every card title, intro, question and button label on the
--      SDR flow (onboarding_step_templates) and the client flow
--      (client_flow_stages / client_flow_steps) rewritten in a modern,
--      British, corporate register. No speaker attribution any more: the
--      card itself speaks ("Daniel, your Customer Success Manager" and
--      "Elena, your HR & Ops lead" are gone from the UI).
--   2. Past-tense completion labels (done_label) for the finish card and
--      Elena's tracking sheet. SDR: a new column. Client: config.done_label.
--   3. Quiz support on the SDR flow: step_type 'quiz' (a card that is
--      entirely a quiz) and a `quiz` jsonb on any card (a quiz at the end of
--      a video). Shape: {"pass_mark": 80, "questions": [{"prompt": "...",
--      "options": ["...", "..."], "answer": 0}]}. No quizzes are seeded;
--      Elena authors them in Dev Center → Onboarding Flow.
--   4. Starters can READ the enabled step templates. Their task rows are
--      snapshots, but uploaded thumbnails, videos, quizzes and completion
--      labels live on the template (so a re-upload re-points every card).
--      Until now only staff could read the table, so the LIVE deck never
--      showed the media the builder uploaded (the sandbox did). Training
--      content only; nothing sensitive is on that table.
--   5. Headset card: Amazon and Takealot links for the Jabra Evolve 20 (one
--      per line in link_url; the card renders one button per link) and the
--      reimbursement wording.
--   6. Document fix: the Fulfilment SDR Playbook PDF was attached to the
--      Employee Handbook card. It moves to the playbook card; the handbook
--      card is left empty for the handbook PDF upload.
--   7. Elena's checklist gains the internet checks (fibre, 10 Mbps up and
--      down), the headset order review and the Close CRM set-up check.
--   8. Pitch deck card: "Not yet" no longer completes the card. It reveals
--      the guide and template links and the upload; the card stays open
--      until a deck is uploaded (config.no_requires_upload).
--
-- SAFE TO RUN TWICE: column adds are IF NOT EXISTS, policies are guarded,
-- checklist rows are ON CONFLICT DO NOTHING, copy updates are idempotent
-- (keyed by step_key / stage_key). Journeys and starter task rows are
-- snapshots and are NOT touched — as of 7 Sep there are none in flight.
--
-- NOTE: applied by the owner via the hosted SQL editor; migration bookkeeping
--       unaware. Never `supabase db push`. Repair list:
--       supabase migration repair --status applied 20260907120000
--       Afterwards run:  notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SDR template columns: done_label, quiz
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.onboarding_step_templates
  ADD COLUMN IF NOT EXISTS done_label text;
ALTER TABLE public.onboarding_step_templates
  ADD COLUMN IF NOT EXISTS quiz jsonb;

-- step_type CHECK gains 'quiz' (templates + task snapshots)
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
  CHECK (step_type IN ('checkoff','link_confirm','question','read_document','upload_proof','confirm_email','quiz'));

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
  CHECK (step_type IN ('checkoff','link_confirm','question','read_document','upload_proof','confirm_email','quiz'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Starters read the enabled templates (media, quizzes, done labels)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'onboarding_step_templates'
      AND policyname = 'Signed-in users read enabled step templates'
  ) THEN
    CREATE POLICY "Signed-in users read enabled step templates"
      ON public.onboarding_step_templates
      FOR SELECT TO authenticated
      USING (enabled = true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SDR copy sweep (keyed by step_key; media and documents untouched)
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.onboarding_step_templates AS t
SET label = v.label,
    description = v.description,
    question_prompt = COALESCE(v.question_prompt, t.question_prompt),
    done_label = v.done_label,
    updated_at = now()
FROM (VALUES
  ('setup_gmail',
   'Confirm your Meridian Sales Partners mailbox',
   'Welcome to Meridian Sales Partners. A Google Workspace invitation has been sent to your personal email address. Once you have signed in and set your password, please enter your new address below.',
   'Have you signed in to your new Meridian Sales Partners mailbox and set your password?',
   'Meridian Sales Partners mailbox confirmed'),
  ('watch_dashboard_video',
   'Watch: setting up your dashboard',
   'This short video introduces Vexon OS, the dashboard you will use every day. Please watch it in full, then mark this card as complete.',
   NULL,
   'Dashboard set-up video watched'),
  ('setup_dashboard',
   'Sign in to your dashboard',
   'You are already here, so this one is straightforward. Take a moment to look around, then confirm that you have signed in.',
   NULL,
   'Signed in to the dashboard'),
  ('watch_close_video',
   'Watch: an introduction to Close CRM',
   'Close is the CRM from which every call is made. This video explains how it is set up and how we use it. You will not need to log in until your first day, so simply watch for now.',
   NULL,
   'Close CRM video watched'),
  ('read_handbook',
   'Read the Employee Onboarding Handbook',
   'The handbook covers how we work, from working hours to holidays. Please open it, read it in full, then confirm below.',
   NULL,
   'Employee Onboarding Handbook read'),
  ('order_headset',
   'Order your headset',
   'Please order the Jabra Evolve 20 headset using one of the links below. The cost is reimbursed in full, so keep your receipt. Once your order has been placed, upload a screenshot of the order confirmation here.',
   NULL,
   'Headset ordered'),
  ('optimise_whatsapp',
   'Set up WhatsApp Business',
   'We use WhatsApp Business to communicate with candidates and clients. Please install it on your phone, complete your profile with your work details, then mark this card as complete.',
   NULL,
   'WhatsApp Business set up'),
  ('optimise_linkedin',
   'Update your LinkedIn profile',
   'Your LinkedIn profile is the first thing a prospect will check. Please update your headline and current role to Meridian Sales Partners, add a clear, professional photograph, then paste the link to your profile below.',
   'Paste the link to your updated LinkedIn profile.',
   'LinkedIn profile updated'),
  ('accept_meetings',
   'Accept your first-day meeting invitations',
   'Your first-day meetings have already been added to your new calendar. Please open Google Calendar, accept every invitation, then confirm here.',
   NULL,
   'First-day meeting invitations accepted'),
  ('speed_test',
   'Run an internet speed test',
   'Clear calls depend on a reliable connection. We recommend a fibre connection with at least 10 Mbps upload and download. Please run the test on the computer you will work from and upload a screenshot of the result.',
   NULL,
   'Internet speed test completed'),
  ('attend_hr_morning',
   'Attend the morning HR meeting',
   'Good morning, and welcome. The day begins with a short meeting with HR. Please mark this card as complete once the meeting has finished.',
   NULL,
   'Morning HR meeting attended'),
  ('attend_manager_1_1',
   'Attend your one-to-one with your manager',
   'Your manager will take you through your targets, your first clients and the shape of the week ahead. Please confirm once the meeting has taken place.',
   NULL,
   'One-to-one with your manager attended'),
  ('confirm_close_access',
   'Set up Close CRM',
   'Your Close invitation will arrive this morning. Please accept it, purchase your phone number and allow microphone access when your browser prompts you.',
   NULL,
   'Close CRM set up'),
  ('read_playbook',
   'Read the Fulfilment SDR Playbook',
   'The playbook sets out how we work a client account from start to finish. Please read it carefully; it is the foundation of everything you will do here.',
   NULL,
   'Fulfilment SDR Playbook read'),
  ('watch_cold_calling_videos',
   'Watch the cold-calling videos',
   'How we open a call, handle objections and keep the conversation moving. Please watch each video in full, then mark this card as complete.',
   NULL,
   'Cold-calling videos watched'),
  ('watch_recruitment_videos',
   'Watch the recruitment videos',
   'An introduction to the recruitment industry: the roles, the terminology and what matters to our clients.',
   NULL,
   'Recruitment videos watched'),
  ('watch_process_script',
   'Watch: our call script',
   'A walkthrough of the script we use on every call and the purpose of each line.',
   NULL,
   'Call script video watched'),
  ('watch_process_qualification',
   'Watch: how we qualify a prospect',
   'What makes a prospect worth a meeting, and the questions that will get you there.',
   NULL,
   'Qualification video watched'),
  ('watch_process_booking',
   'Watch: how we book meetings',
   'How a booking is confirmed, logged and handed over so that the meeting takes place.',
   NULL,
   'Booking process video watched')
) AS v(step_key, label, description, question_prompt, done_label)
WHERE t.step_key = v.step_key;

-- Headset links: one per line; the card renders a button per link.
UPDATE public.onboarding_step_templates
SET link_url = E'https://www.amazon.co.za/dp/B0BSG58YKK\nhttps://www.takealot.com/jabra-evolve-20-headset-with-mic/PLID46643261',
    updated_at = now()
WHERE step_key = 'order_headset';

-- The playbook PDF was attached to the handbook card: move it.
UPDATE public.onboarding_step_templates
SET document_path = COALESCE(document_path, 'docs/mszsb3ap-UK-Fulfilment-Team-SDR-Playbook.pdf'),
    updated_at = now()
WHERE step_key = 'read_playbook';

UPDATE public.onboarding_step_templates
SET document_path = NULL, updated_at = now()
WHERE step_key = 'read_handbook'
  AND document_path = 'docs/mszsb3ap-UK-Fulfilment-Team-SDR-Playbook.pdf';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Elena's checklist: internet, headset and Close checks
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.hr_starter_checklist_templates (key, label, sort_order, enabled) VALUES
  ('headset_reviewed',  'Headset order confirmation reviewed',                         6, true),
  ('fibre_confirmed',   'Fibre-optic internet connection confirmed',                    7, true),
  ('speed_confirmed',   'Internet speed confirmed at 10 Mbps or above, upload and download', 8, true),
  ('close_setup_checked', 'Close CRM set-up checked',                                  9, true)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Client flow copy sweep
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.client_flow_stages AS s
SET title = v.title, subtitle = v.subtitle
FROM (VALUES
  ('account_setup',   'Welcome',                 'Your login is ready'),
  ('onboarding_form', 'About your business',     'The foundation of your campaign'),
  ('workspace',       'Your team@ mailbox',      'So that every reply reaches you'),
  ('book_call',       'Your onboarding call',    'Sixty minutes with your Customer Success Manager'),
  ('calendar',        'Connect your calendar',   'Meetings straight into your diary'),
  ('prepare',         'Preparing to win',        'A few things that make the first weeks count')
) AS v(stage_key, title, subtitle)
WHERE s.stage_key = v.stage_key;

UPDATE public.client_flow_steps AS t
SET label = v.label,
    description = v.description,
    config = t.config || v.patch::jsonb
FROM (VALUES
  ('create_login',
   'Create your login',
   'Welcome to Meridian Sales Partners. This first step is completed automatically the moment you sign in, so you are already under way.',
   '{"done_label": "Login created"}'),
  ('onboarding_form',
   'Tell us about your business',
   'Please complete the onboarding form. It is the single most important step in this process: every list we build, every call we make and every message we send begins with these answers. The form opens full screen, saves as you type, and you can return to it at any time.',
   '{"done_label": "Business details provided"}'),
  ('google_workspace',
   'Set up your team@ mailbox',
   'Campaign emails are sent from an address on your own domain, so that every reply reaches you and appears to come from your team. Please create a mailbox named team@ followed by your domain (for example, team@abcrecruitment.com) in Google Workspace, then enter the address below. Secure access will be arranged on your onboarding call, never through a form.',
   '{"done_label": "Team mailbox set up"}'),
  ('book_onboarding_call',
   'Book your onboarding call',
   'Please choose a time for your sixty-minute onboarding call. The times shown are live availability in UK time, and a calendar invitation with a video link will be sent to you the moment you confirm.',
   '{"done_label": "Onboarding call booked"}'),
  ('connect_calendar',
   'Connect your calendar to Vexon OS',
   'Every meeting we book on your behalf should appear in your diary automatically, with the prospect invited and a video link attached. Please connect your Google or Microsoft calendar here: a window will open, you approve access, and the connection is made.',
   '{"done_label": "Calendar connected"}'),
  ('pitch_deck',
   'Your pitch deck',
   'Please upload your pitch deck or sales one-pager so that our team presents your business exactly as you would. If you do not yet have one, select "Not yet": you will find a short guide and a template to help you produce one, and this card remains open until a deck has been uploaded.',
   '{"question": "Do you have a pitch deck or a sales one-pager?", "no_label": "Not yet", "no_requires_upload": true, "no_guide_label": "How to create a simple pitch deck", "template_label": "Download the pitch deck template", "template_url": "https://vexon-os.example/onboarding/pitch-deck-template-placeholder.pdf", "no_guide_url": "https://vexon-os.example/onboarding/how-to-create-a-simple-pitch-deck-placeholder.pdf", "done_label": "Pitch deck uploaded"}'),
  ('target_companies',
   'Companies to prioritise',
   'If there are specific companies or warm prospects you would like us to approach first, please share them here. Even a rough list allows us to target your best-fit accounts from day one rather than relying solely on our own research.',
   '{"question": "Do you have a list of companies or warm prospects you would like us to prioritise?", "no_label": "No, not at present", "done_label": "Priority companies shared"}'),
  ('reengage',
   'Relationships worth re-engaging',
   'Some of the quickest wins come from companies that already know you: past clients you have not worked with for some time, opportunities that went quiet and conversations that never quite converted. Share them here and we will pick them up in the first week.',
   '{"question": "Are there past clients, dormant opportunities or previous conversations we should re-engage on your behalf?", "no_label": "No, not at present", "done_label": "Re-engagement contacts shared"}'),
  ('do_not_contact',
   'Do not contact list',
   'Please tell us about any companies or individuals we should never approach: current clients, partners, anyone under an agreement or a sensitive relationship. They will be excluded from every campaign list.',
   '{"question": "Are there any companies or individuals we should not contact?", "no_label": "No, none", "done_label": "Do not contact list provided"}'),
  ('fee_plans',
   'Standardised terms',
   'If you have documented fee structures or service tiers, for example standard, retained and exclusive, please upload them here so that we describe your terms exactly as you would.',
   '{"question": "Do you have documented fee structures or service tiers?", "no_label": "No, not at present", "done_label": "Standardised terms provided"}'),
  ('anything_else',
   'Anything else that helps us represent you',
   'Case studies, testimonials, brand guidelines, live job specifications, awards: anything that helps us sound like you. If nothing comes to mind, mark this card as complete and we will cover it on your onboarding call.',
   '{"question": "Is there anything else that would help us represent you well?", "no_label": "Nothing further", "done_label": "Supporting materials shared"}'),
  ('best_practice_guide',
   'Read the best-practice guide for booked meetings',
   'A short guide to getting the most from the meetings we book for you.',
   '{"done_label": "Best-practice guide read"}')
) AS v(step_key, label, description, patch)
WHERE t.step_key = v.step_key;

-- The team@ mailbox question label
UPDATE public.client_flow_steps
SET config = jsonb_set(
  config, '{questions}',
  (SELECT jsonb_agg(CASE WHEN q->>'key' = 'team_mailbox'
                         THEN q || '{"label": "The address you have created", "help": "For example, team@abcrecruitment.com"}'::jsonb
                         ELSE q END)
   FROM jsonb_array_elements(config->'questions') q))
WHERE step_key = 'google_workspace' AND config ? 'questions';

-- The onboarding call event description (client-facing in the invite)
UPDATE public.booking_event_types
SET description = 'Your sixty-minute onboarding call with your Customer Success Manager. We walk through your answers, agree the target list and set the campaign up to win early.',
    updated_at = now()
WHERE slug = 'onboarding-call-msp-a7w3k';
