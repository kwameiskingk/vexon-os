-- Onboarding rules, 11 Sep 2026 (Marcus's 8 Sep walkthrough, Batch 2).
--
-- 1. Marcus (sdr_manager) and Elena (hr) can run the client onboarding
--    simulation: they need to read client_flow_stages / client_flow_steps.
-- 2. Elena authors the new-starter deck (cards, videos, quizzes) from the
--    HR sidebar: hr gets the write on onboarding_step_templates that only
--    admin/dev had.
-- 3. Copy: the pitch deck guide link is a video ("Video: how to create a
--    simple pitch deck"), and "Anything else" no longer tells the client they
--    may skip it — every card must receive something.
--
-- Safe to run twice. Applied by the owner via the hosted SQL editor.

-- ── 1. Client flow readable by hr + sdr_manager ────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_flow_stages' AND policyname='HR and SDR managers read flow stages') THEN
    CREATE POLICY "HR and SDR managers read flow stages" ON public.client_flow_stages
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(),'hr'::public.app_role) OR public.has_role(auth.uid(),'sdr_manager'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_flow_steps' AND policyname='HR and SDR managers read flow steps') THEN
    CREATE POLICY "HR and SDR managers read flow steps" ON public.client_flow_steps
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(),'hr'::public.app_role) OR public.has_role(auth.uid(),'sdr_manager'::public.app_role));
  END IF;
END $$;

-- ── 2. HR manages the new-starter deck ─────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='onboarding_step_templates' AND policyname='HR manages step templates') THEN
    CREATE POLICY "HR manages step templates" ON public.onboarding_step_templates
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'hr'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(),'hr'::public.app_role));
  END IF;
END $$;

-- ── 3. Copy ────────────────────────────────────────────────────────────────
UPDATE public.client_flow_steps
SET config = coalesce(config, '{}'::jsonb) || '{"no_guide_label": "Video: how to create a simple pitch deck"}'::jsonb
WHERE step_key = 'pitch_deck'
  AND coalesce(config->>'no_guide_label', '') IN ('', 'How to create a simple pitch deck', 'How to build a simple pitch deck');

UPDATE public.client_flow_steps
SET description = 'Case studies, testimonials, brand guidelines, live job specifications, awards: anything that helps us sound like you. Please add at least one item here; we will go through everything together on your onboarding call.'
WHERE step_key = 'anything_else'
  AND description LIKE '%mark this card as complete%';
