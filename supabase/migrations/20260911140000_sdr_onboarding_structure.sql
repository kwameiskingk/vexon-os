-- New-starter (SDR) onboarding structure, 11 Sep 2026 (Marcus's 8 Sep call, Batch 4).
--
-- 1. Day one is released BY HAND by Elena on the morning (not by the start
--    date): employee_onboarding.day_one_released_at / _by. Until it is set,
--    the day-one cards stay locked and the starter sees the "Before you
--    start is complete" screen with their day-one itinerary.
-- 2. onboarding_flow_settings (one row): the text of that section-end
--    screen (itinerary + who to contact) and the closing video that plays
--    before the finish card — the SDR twin of client_flow_settings.
-- 3. Template changes: the dashboard walkthrough video moves to the END of
--    day one (Marcus: "it should come last, they are about to go into the
--    dashboard"); a "Your first week" card is added; the headset card gains
--    the UK Amazon link; the LinkedIn card gets its placeholder banner
--    download and example-profile wording; the first card states that
--    finishing "Before you start" ahead of the start date is a condition
--    of starting.
-- 4. Elena's starter checklist gains "Google Workspace mailbox created" as
--    the first item — the invite now goes to that mailbox.
--
-- Safe to run twice. Applied by the owner via the hosted SQL editor.

-- ── 1. Manual day-one release ──────────────────────────────────────────────
ALTER TABLE public.employee_onboarding
  ADD COLUMN IF NOT EXISTS day_one_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS day_one_released_by uuid;

-- ── 2. Flow-level settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_flow_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pre_start_end_title text NOT NULL DEFAULT 'You are ready for day one.',
  pre_start_end_body text NOT NULL DEFAULT '',
  contact_name text,
  contact_email text,
  finish_video_path text,
  finish_video_url text,
  finish_thumbnail_path text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_flow_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='onboarding_flow_settings' AND policyname='Signed-in users read onboarding flow settings') THEN
    CREATE POLICY "Signed-in users read onboarding flow settings" ON public.onboarding_flow_settings
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='onboarding_flow_settings' AND policyname='Onboarding authors manage flow settings') THEN
    CREATE POLICY "Onboarding authors manage flow settings" ON public.onboarding_flow_settings
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'dev'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'hr'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'dev'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'hr'::public.app_role));
  END IF;
END $$;

INSERT INTO public.onboarding_flow_settings (id, pre_start_end_title, pre_start_end_body, contact_name, contact_email)
VALUES (
  1,
  'You are ready for day one.',
  E'Here is how your first day runs:\n\n• The morning meeting with HR to welcome you and cover the essentials\n• A one-to-one with your manager\n• Getting set up on Close, the CRM every call is made from\n• The Fulfilment SDR Playbook, our call script, how we qualify a prospect and how we book meetings, with a short quiz on each\n• Your first call review with Marcus, which then happens every day for your first week\n\nYour day-one cards open here once HR releases them on the morning. Until then there is nothing more to do; if anything is unclear or you need help before you start, please get in touch.',
  'Elena',
  'elena@meridiansales.example'
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Template changes ────────────────────────────────────────────────────
-- Dashboard walkthrough moves to the end of day one.
UPDATE public.onboarding_step_templates
SET phase = 'day_one',
    sort_order = 21,
    label = 'Watch: getting around your dashboard',
    description = 'You are about to move into Vexon OS proper. This short walkthrough shows where everything lives: your appointments, your booking links, your metrics and your resources. Watch it in full, then mark this card as complete to open your dashboard.',
    updated_at = now()
WHERE step_key = 'watch_dashboard_video';

-- "Your first week" card (day one, just before the walkthrough).
INSERT INTO public.onboarding_step_templates (step_key, label, phase, step_type, sort_order, enabled, description, done_label)
SELECT 'week_one_itinerary', 'Your first week', 'day_one', 'checkoff', 20, true,
       E'For your first week every new starter sits with Marcus for a call review every single day. Each session goes through real calls from that day, what worked, and what to change tomorrow. You will also be given your client booking links and your client-specific script to bookmark on day one. Read this, then mark it as complete.',
       'First-week plan read'
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_step_templates WHERE step_key = 'week_one_itinerary');

-- Headset: UK Amazon alongside South Africa (Elena, 8 Sep; link from the handbook).
UPDATE public.onboarding_step_templates
SET link_url = E'https://www.amazon.co.uk/dp/B00O1A9FT2\nhttps://www.amazon.co.za/dp/B0BSG58YKK\nhttps://www.takealot.com/jabra-evolve-20-headset-with-mic/PLID46643261',
    description = 'Please order the Jabra Evolve 20 headset using the link for your country below. The cost is reimbursed in full, so keep your receipt. Once your order has been placed, upload a screenshot of the order confirmation here.',
    updated_at = now()
WHERE step_key = 'order_headset'
  AND (link_url IS NULL OR link_url NOT LIKE '%amazon.co.uk%');

-- LinkedIn: placeholder banner download + example-profile wording (Marcus: "put a placeholder now so we don't forget").
UPDATE public.onboarding_step_templates
SET link_url = 'https://vexon-os.example/onboarding/linkedin-banner-placeholder.png',
    description = 'Your LinkedIn profile is the first thing a prospect will check. Update your headline and current role to Meridian Sales Partners, add a clear, professional photograph, and use the Meridian Sales Partners banner (download it below). The example profile shown here is the standard to aim for. Then paste the link to your profile below.',
    updated_at = now()
WHERE step_key = 'optimise_linkedin'
  AND (link_url IS NULL OR link_url = '');

-- First card: completing "Before you start" is a condition of starting (Marcus, 8 Sep).
UPDATE public.onboarding_step_templates
SET description = 'Completing everything in "Before you start" ahead of your first day is a condition of starting with us. ' || description,
    updated_at = now()
WHERE step_key = 'setup_gmail'
  AND description NOT LIKE 'Completing everything in%';

-- ── 4. Elena's checklist: the Workspace mailbox comes first ───────────────
INSERT INTO public.hr_starter_checklist_templates (key, label, sort_order, enabled)
VALUES ('workspace_created', 'Google Workspace mailbox created (the onboarding invite goes there)', 0, true)
ON CONFLICT (key) DO NOTHING;
