-- ============================================================================
-- CLIENT ONBOARDING FLOW — journey schema, security tightening, flow seed
-- 2026-08-26 · Design: CLIENT_ONBOARDING_BUILD_PLAN_2026-08-26.html + the owner's
-- voice-note rulings (trigger = signed → CSM confirms paid → welcome email).
--
-- Parts:
--   A. client_profiles.is_test_account (demo isolation for the Dev Center test button)
--   B. Flow templates: client_flow_stages + client_flow_steps (authored in Dev Center / CSM tab)
--   C. Per-client journey: client_onboarding_journeys + client_journey_tasks + stage unlocks
--   D. Security: is_internal_user() + tighten booking table reads (clients no longer
--      read every event's config / room links)
--   E. Storage: client-onboarding-assets bucket (guide PDFs + client uploads)
--   F. Seed: Daniel's five-stage flow (editable afterwards in the builder)
--   G. Seed: "Onboarding Call" booking event hosted by Daniel (placeholder hours)
--
-- Self-guarded: safe to re-run. Apply via the hosted builder SQL editor.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- A. Test-account isolation on client_profiles
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────────────────────
-- B. Flow templates (what Daniel/the owner author; editing affects FUTURE clients only)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_flow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.client_flow_stages(id) ON DELETE CASCADE,
  step_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  step_type text NOT NULL DEFAULT 'confirm'
    CHECK (step_type IN ('confirm','form','booking','calendar_connect','upload','text_list','read_document','link')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  video_url text,
  document_path text,
  link_url text,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_flow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_flow_steps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_flow_stages' AND policyname='Onboarding staff manage flow stages') THEN
    CREATE POLICY "Onboarding staff manage flow stages" ON public.client_flow_stages
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_flow_steps' AND policyname='Onboarding staff manage flow steps') THEN
    CREATE POLICY "Onboarding staff manage flow steps" ON public.client_flow_steps
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_client_flow_stages_updated_at ON public.client_flow_stages;
CREATE TRIGGER update_client_flow_stages_updated_at BEFORE UPDATE ON public.client_flow_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_client_flow_steps_updated_at ON public.client_flow_steps;
CREATE TRIGGER update_client_flow_steps_updated_at BEFORE UPDATE ON public.client_flow_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ────────────────────────────────────────────────────────────────────────────
-- C. Per-client journey (snapshot of the flow at trigger time)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_onboarding_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL UNIQUE REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment','active','completed','cancelled')),
  source text NOT NULL DEFAULT 'manual',           -- manual | pandadoc | deal_won | test
  contract_signed_at timestamptz,
  payment_confirmed_at timestamptz,
  payment_confirmed_by uuid,
  welcome_email_sent_at timestamptz,
  first_signed_in_at timestamptz,
  campaign_live_at timestamptz,
  campaign_live_by uuid,
  completed_at timestamptz,
  pandadoc_document_id text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_journey_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.client_onboarding_journeys(id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  stage_title text NOT NULL,
  stage_subtitle text,
  stage_order integer NOT NULL,
  step_key text NOT NULL,
  label text NOT NULL,
  description text,
  step_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  video_url text,
  document_path text,
  link_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid,
  waived_by uuid,
  waived_at timestamptz,
  waive_note text,
  answers jsonb,
  file_path text,
  booking_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journey_id, step_key)
);

CREATE TABLE IF NOT EXISTS public.client_journey_stage_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.client_onboarding_journeys(id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  unlocked_by uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journey_id, stage_key)
);

ALTER TABLE public.client_onboarding_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_journey_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_journey_stage_unlocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Staff manage everything
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_onboarding_journeys' AND policyname='Onboarding staff manage journeys') THEN
    CREATE POLICY "Onboarding staff manage journeys" ON public.client_onboarding_journeys
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_journey_tasks' AND policyname='Onboarding staff manage journey tasks') THEN
    CREATE POLICY "Onboarding staff manage journey tasks" ON public.client_journey_tasks
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_journey_stage_unlocks' AND policyname='Onboarding staff manage stage unlocks') THEN
    CREATE POLICY "Onboarding staff manage stage unlocks" ON public.client_journey_stage_unlocks
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role));
  END IF;

  -- Clients read their OWN journey (writes go through the client-onboarding edge
  -- function only, which enforces stage locking server-side — no client write policies).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_onboarding_journeys' AND policyname='Clients read own journey') THEN
    CREATE POLICY "Clients read own journey" ON public.client_onboarding_journeys
      FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.client_profile_users cpu
                WHERE cpu.client_profile_id = client_onboarding_journeys.client_profile_id
                  AND cpu.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.client_profiles cp
                WHERE cp.id = client_onboarding_journeys.client_profile_id
                  AND cp.user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_journey_tasks' AND policyname='Clients read own journey tasks') THEN
    CREATE POLICY "Clients read own journey tasks" ON public.client_journey_tasks
      FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.client_onboarding_journeys j
                WHERE j.id = client_journey_tasks.journey_id
                  AND (EXISTS (SELECT 1 FROM public.client_profile_users cpu
                               WHERE cpu.client_profile_id = j.client_profile_id AND cpu.user_id = auth.uid())
                    OR EXISTS (SELECT 1 FROM public.client_profiles cp
                               WHERE cp.id = j.client_profile_id AND cp.user_id = auth.uid())))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_journey_stage_unlocks' AND policyname='Clients read own stage unlocks') THEN
    CREATE POLICY "Clients read own stage unlocks" ON public.client_journey_stage_unlocks
      FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.client_onboarding_journeys j
                WHERE j.id = client_journey_stage_unlocks.journey_id
                  AND (EXISTS (SELECT 1 FROM public.client_profile_users cpu
                               WHERE cpu.client_profile_id = j.client_profile_id AND cpu.user_id = auth.uid())
                    OR EXISTS (SELECT 1 FROM public.client_profiles cp
                               WHERE cp.id = j.client_profile_id AND cp.user_id = auth.uid())))
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_client_onboarding_journeys_updated_at ON public.client_onboarding_journeys;
CREATE TRIGGER update_client_onboarding_journeys_updated_at BEFORE UPDATE ON public.client_onboarding_journeys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_client_journey_tasks_updated_at ON public.client_journey_tasks;
CREATE TRIGGER update_client_journey_tasks_updated_at BEFORE UPDATE ON public.client_journey_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ────────────────────────────────────────────────────────────────────────────
-- D. Security tightening: clients must not read every booking event's config.
--    is_internal_user() = holds any role other than 'client'.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_internal_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role <> 'client'::public.app_role
  );
$$;

-- Replace the blanket authenticated-read policies from 20260819120000.
-- Anonymous/public booking pages are unaffected (they go through the
-- booking-public edge function, which uses the service role).
DROP POLICY IF EXISTS "Authenticated read booking_event_types" ON public.booking_event_types;
DROP POLICY IF EXISTS "Internal users read booking_event_types" ON public.booking_event_types;
CREATE POLICY "Internal users read booking_event_types" ON public.booking_event_types
  FOR SELECT TO authenticated USING (public.is_internal_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read booking_event_hosts" ON public.booking_event_hosts;
DROP POLICY IF EXISTS "Internal users read booking_event_hosts" ON public.booking_event_hosts;
CREATE POLICY "Internal users read booking_event_hosts" ON public.booking_event_hosts
  FOR SELECT TO authenticated USING (public.is_internal_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read booking_availability_rules" ON public.booking_availability_rules;
DROP POLICY IF EXISTS "Internal users read booking_availability_rules" ON public.booking_availability_rules;
CREATE POLICY "Internal users read booking_availability_rules" ON public.booking_availability_rules
  FOR SELECT TO authenticated USING (public.is_internal_user(auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- E. Storage: guide PDFs (flow-docs/) + client uploads (uploads/{client_profile_id}/)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-onboarding-assets', 'client-onboarding-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_client_of_profile(_user_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.client_profile_users
                 WHERE user_id = _user_id AND client_profile_id = _profile_id)
      OR EXISTS (SELECT 1 FROM public.client_profiles
                 WHERE id = _profile_id AND user_id = _user_id);
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Onboarding staff manage client onboarding assets') THEN
    CREATE POLICY "Onboarding staff manage client onboarding assets" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'client-onboarding-assets'
        AND (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role)))
      WITH CHECK (bucket_id = 'client-onboarding-assets'
        AND (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
          OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Clients read onboarding flow docs') THEN
    CREATE POLICY "Clients read onboarding flow docs" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'client-onboarding-assets' AND name LIKE 'flow-docs/%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Clients upload own onboarding files') THEN
    CREATE POLICY "Clients upload own onboarding files" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'client-onboarding-assets'
        AND name LIKE 'uploads/%'
        AND public.is_client_of_profile(auth.uid(), NULLIF(split_part(name,'/',2),'')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Clients read own onboarding files') THEN
    CREATE POLICY "Clients read own onboarding files" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'client-onboarding-assets'
        AND name LIKE 'uploads/%'
        AND public.is_client_of_profile(auth.uid(), NULLIF(split_part(name,'/',2),'')::uuid));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- F. Seed Daniel's five-stage flow (guarded per stage_key; edit in the builder)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.client_flow_stages) THEN
    RAISE NOTICE 'client_flow_stages already seeded — skipping flow seed';
    RETURN;
  END IF;

  INSERT INTO public.client_flow_stages (stage_key, title, subtitle, sort_order) VALUES
    ('account_setup',  'Welcome and account setup', 'Triggered on contract signature', 1) RETURNING id INTO s1;
  INSERT INTO public.client_flow_stages (stage_key, title, subtitle, sort_order) VALUES
    ('onboarding_form','Onboarding form', 'About your business and your ICP', 2) RETURNING id INTO s2;
  INSERT INTO public.client_flow_stages (stage_key, title, subtitle, sort_order) VALUES
    ('book_call',      'Book your onboarding call', '45 minutes with your Customer Success Manager', 3) RETURNING id INTO s3;
  INSERT INTO public.client_flow_stages (stage_key, title, subtitle, sort_order) VALUES
    ('prepare',        'Prepare for your call', 'Five items to unlock early wins', 4) RETURNING id INTO s4;
  INSERT INTO public.client_flow_stages (stage_key, title, subtitle, sort_order) VALUES
    ('campaign_live',  'Campaign live', 'Setters start dialling', 5) RETURNING id INTO s5;

  INSERT INTO public.client_flow_steps (stage_id, step_key, label, description, step_type, config, sort_order) VALUES
    (s1, 'create_login', 'Create your login and confirm your details',
        'Completed automatically the first time you sign in.', 'confirm', '{"auto":"first_sign_in"}'::jsonb, 1),

    (s2, 'onboarding_form', 'Tell us about your business',
        'This shapes your entire campaign — the more detail, the better your results.', 'form',
        '{"questions":[
          {"key":"target_market","label":"Describe your target market — the job titles and sectors you place","type":"textarea","required":true},
          {"key":"geography","label":"Which geographies do you recruit in?","type":"text","required":true},
          {"key":"fee_structure","label":"What is your fee structure?","type":"text","required":true},
          {"key":"avg_deal_size","label":"What is your average fee / deal size?","type":"text","required":true},
          {"key":"positioning","label":"How do you position yourselves against competitors?","type":"textarea","required":true},
          {"key":"objections","label":"What objections do you hear most from prospects?","type":"textarea","required":true},
          {"key":"campaign_goals","label":"What would make this campaign a success for you?","type":"textarea","required":true}
        ]}'::jsonb, 1),

    (s3, 'book_onboarding_call', 'Choose a time with your Customer Success Manager',
        'Pick a slot from live availability — you''ll get a Google invite with a Meet link.', 'booking',
        '{"event_slug":"onboarding-call-msp-a7w3k"}'::jsonb, 1),

    (s4, 'connect_calendar', 'Connect your calendar to Vexon OS Bookings',
        'So booked meetings land straight in your diary.', 'calendar_connect', '{}'::jsonb, 1),
    (s4, 'upload_pitch_deck', 'Upload your pitch deck', NULL, 'upload',
        '{"accept":".pdf,.ppt,.pptx,.key"}'::jsonb, 2),
    (s4, 'warm_leads', 'List the warm leads and companies to target', NULL, 'text_list',
        '{"placeholder":"Company name — contact — why they''re warm","min_items":1}'::jsonb, 3),
    (s4, 'past_clients', 'List old clients worth re-engaging', NULL, 'text_list',
        '{"placeholder":"Company name — last worked together — notes","min_items":1}'::jsonb, 4),
    (s4, 'best_practice_guide', 'Read the best practice guide for booked meetings', NULL, 'read_document',
        '{}'::jsonb, 5);
  -- Stage 5 has no client steps — it completes when the CSM marks the campaign live.
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- G. Seed the "Onboarding Call" event with Daniel as host. Hours per the owner
--    (26 Aug): Daniel's standard windows — Mon 11–17, Tue–Thu 9–17, Fri 9–16
--    UK. Adjust any time in Dev Center → Bookings.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  csm_id uuid;
  ev_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.booking_event_types WHERE slug = 'onboarding-call-msp-a7w3k') THEN
    RAISE NOTICE 'Onboarding call event already exists — skipping';
    RETURN;
  END IF;

  SELECT id INTO csm_id FROM public.profiles WHERE lower(email) = 'daniel@meridiansales.example' LIMIT 1;
  IF csm_id IS NULL THEN
    RAISE NOTICE 'Daniel profile not found — onboarding call event NOT seeded; create it in Dev Center → Bookings';
    RETURN;
  END IF;

  INSERT INTO public.booking_event_types
    (name, slug, description, duration_minutes, questions, location_type, side,
     is_active, accepting_bookings, round_robin, staff_mode, lock_timezone, default_source)
  VALUES
    ('Onboarding Call With Meridian Sales Partners', 'onboarding-call-msp-a7w3k',
     'Your 45-minute onboarding call with your dedicated Customer Success Manager.',
     45, '[]'::jsonb, 'google_meet', 'fulfilment',
     true, true, false, false, NULL, 'admin')
  RETURNING id INTO ev_id;

  INSERT INTO public.booking_event_hosts (event_type_id, host_user_id, host_calendar_email, priority)
  VALUES (ev_id, csm_id, 'daniel@meridiansales.example', 1);

  -- Host-level availability only if Daniel has none yet (rules are per host)
  IF NOT EXISTS (SELECT 1 FROM public.booking_availability_rules WHERE host_user_id = csm_id) THEN
    INSERT INTO public.booking_availability_rules
      (host_user_id, weekday, start_time, end_time, timezone, buffer_minutes, min_notice_minutes)
    VALUES
      (csm_id, 1, '11:00', '17:00', 'Europe/London', 15, 240),
      (csm_id, 2, '09:00', '17:00', 'Europe/London', 15, 240),
      (csm_id, 3, '09:00', '17:00', 'Europe/London', 15, 240),
      (csm_id, 4, '09:00', '17:00', 'Europe/London', 15, 240),
      (csm_id, 5, '09:00', '16:00', 'Europe/London', 15, 240);
  END IF;
END $$;
