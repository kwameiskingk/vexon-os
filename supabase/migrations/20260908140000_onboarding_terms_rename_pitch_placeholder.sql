-- Client onboarding deck, 8 Sep 2026 (Core Team call):
-- 1. Daniel's rename: "Your terms of business" -> "Standardised terms"
--    (step_key fee_plans is unchanged; only label + done_label move).
-- 2. Marcus: "put a dummy document in there" on the pitch deck card until the
--    real guide and template exist. Two placeholder PDFs ship in the app's
--    public folder (public/onboarding/*.pdf, served at vexon-os.example/onboarding/),
--    so the "Not yet" path has something to open. Daniel replaces both links
--    in the flow builder (Template URL / Guide URL fields) when ready.
-- Copy lives in the database; safe to run twice.

UPDATE public.client_flow_steps
SET label = 'Standardised terms',
    config = coalesce(config, '{}'::jsonb) || '{"done_label": "Standardised terms provided"}'::jsonb
WHERE step_key = 'fee_plans';

UPDATE public.client_flow_steps
SET config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'template_url', 'https://vexon-os.example/onboarding/pitch-deck-template-placeholder.pdf',
      'no_guide_url', 'https://vexon-os.example/onboarding/how-to-create-a-simple-pitch-deck-placeholder.pdf'
    )
WHERE step_key = 'pitch_deck'
  AND coalesce(config->>'template_url', '') = ''
  AND coalesce(config->>'no_guide_url', '') = '';
