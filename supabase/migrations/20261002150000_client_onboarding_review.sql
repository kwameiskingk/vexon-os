-- 2 Oct 2026: Marcus's client onboarding review (53-minute call) and the
-- onboarding-call slot problem. Safe to run twice.

-- 1. Daniel's onboarding call: no buffer, so the slots mirror his calendar
--    (Marcus + the owner: "remove the buffer if need be").
UPDATE public.booking_availability_rules
SET buffer_minutes = 0
WHERE host_user_id = 'b55bfa88-fd26-46d6-8214-9d7aecf4064e';

-- 2. "Connect your calendar" moves to straight after the onboarding form,
--    before the team@ mailbox (stages run 10, 20, 30, 40, 50, 60).
UPDATE public.client_flow_stages SET sort_order = 25 WHERE stage_key = 'calendar';

-- 3. "Companies to prioritise" is gone (step and video).
UPDATE public.client_flow_steps
SET enabled = false, config = coalesce(config, '{}'::jsonb) - 'intro_video_path'
WHERE step_key = 'target_companies';

-- 4. Videos come off the cards Daniel is re-recording, so he records against
--    a clean card. The cards still work without one.
UPDATE public.client_flow_steps
SET config = coalesce(config, '{}'::jsonb) - 'intro_video_path'
WHERE step_key IN ('book_onboarding_call', 'reengage', 'fee_plans', 'anything_else');

-- 5. First card is Daniel's welcome, not "Create your login". It still
--    auto-completes on first sign-in; the video is swapped for the clean
--    "1. OB - Intro & Welcome" file once encoded (separate data change).
UPDATE public.client_flow_steps
SET label = 'Welcome to Meridian',
    description = 'A short welcome from Daniel, your Customer Success Manager. Watch it, then carry on to the onboarding form.'
WHERE step_key = 'create_login';

-- 6. Enquire client onboarding form: one region per campaign, and the US
--    states question only after US / Canada. Daniel keeps every other wording
--    change in the Form Builder. Applied to the draft and the live copy.
DO $$
DECLARE
  k text;
  states jsonb := '[]'::jsonb;
  st text;
  i int := 0;
  rule jsonb := '{"id":"logic_us_states","question_id":"countries","op":"neq","value":"US / Canada","action":"jump","target":"industry_or_talent_led"}'::jsonb;
BEGIN
  FOREACH st IN ARRAY ARRAY['Nationwide','Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','Washington DC','West Virginia','Wisconsin','Wyoming','Canada (all provinces)'] LOOP
    states := states || jsonb_build_object('id', 'us_states_' || i, 'label', st, 'points', 0);
    i := i + 1;
  END LOOP;

  FOREACH k IN ARRAY ARRAY['schema', 'published_schema'] LOOP
    EXECUTE format($q$
      UPDATE public.forms f
      SET %1$I = (
        SELECT jsonb_set(
          jsonb_set(f.%1$I, '{questions}', (
            SELECT jsonb_agg(
              CASE q->>'id'
                WHEN 'countries' THEN (q - 'help') || jsonb_build_object(
                  'type', 'choice',
                  'title', 'Which region are we targeting for this campaign?',
                  'choices', jsonb_build_array(
                    jsonb_build_object('id','countries_0','label','UK / Europe','points',0),
                    jsonb_build_object('id','countries_1','label','US / Canada','points',0),
                    jsonb_build_object('id','countries_2','label','Middle East','points',0)))
                WHEN 'us_states' THEN q || jsonb_build_object(
                  'type', 'multi_choice',
                  'title', 'Which US states or Canadian provinces are relevant to this campaign?',
                  'help', 'Pick Nationwide if there is no restriction.',
                  'choices', $2::jsonb)
                ELSE q
              END ORDER BY ord)
            FROM jsonb_array_elements(f.%1$I->'questions') WITH ORDINALITY AS t(q, ord)
          )),
          '{logic}',
          (SELECT coalesce(jsonb_agg(r), '[]'::jsonb) FROM jsonb_array_elements(coalesce(f.%1$I->'logic','[]'::jsonb)) r WHERE r->>'id' <> 'logic_us_states') || jsonb_build_array($1::jsonb)
        )
      )
      WHERE f.slug = 'client-onboarding' AND f.%1$I IS NOT NULL
    $q$, k) USING rule, states;
  END LOOP;
END $$;
