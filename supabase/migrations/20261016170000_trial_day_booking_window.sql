-- Trial day booking window (16 Oct 2026, the owner).
--
-- The trialist's "Log a meeting-ready lead" is now a booking page for the
-- client they represent (under its trial name), on the client's real free
-- times. Logging it books NOTHING: no calendar entry, no text, no email. It
-- lands with Elena (Ops Command > Trialist leads) and Daniel, who book it on
-- the client's calendar for one of the picked times or any other free one.
--
--   1. trial_leads.location_choice ('video' | 'phone' = callback) and
--      trial_leads.chosen_times (the first choice, then the others, 2 to 3).
--   2. submit_trial_lead(): email required (even for a callback), 2 to 3
--      times, the client must be one this trialist represents; the old
--      proposed_times {date,time} are still written (UK time) for the pages
--      that read them; the alert goes to Ops Command, not the CSM.
--
-- Safe to run twice.

ALTER TABLE public.trial_leads ADD COLUMN IF NOT EXISTS location_choice text;
ALTER TABLE public.trial_leads ADD COLUMN IF NOT EXISTS chosen_times timestamptz[];
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trial_leads_location_choice_check') THEN
    ALTER TABLE public.trial_leads ADD CONSTRAINT trial_leads_location_choice_check
      CHECK (location_choice IS NULL OR location_choice IN ('video', 'phone'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.submit_trial_lead(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_candidate uuid;
  v_id uuid;
  v_name text;
  v_client uuid := NULLIF(_payload->>'client_profile_id', '')::uuid;
  v_client_name text;
  v_email text := trim(coalesce(_payload->>'contact_email', ''));
  v_choice text := coalesce(NULLIF(_payload->>'location_choice', ''), 'video');
  v_times timestamptz[];
  v_proposed jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'trialist'::public.app_role) THEN
    RAISE EXCEPTION 'Only a trialist can log a trial lead';
  END IF;
  -- Same row trial_active_clients() reads, so the client check and the
  -- lead's candidate always agree.
  SELECT id INTO v_candidate FROM public.candidates
   WHERE trialist_user_id = auth.uid()
   ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF v_candidate IS NULL THEN
    RAISE EXCEPTION 'No trial candidate is linked to this login';
  END IF;
  IF coalesce(_payload->>'close_lead_link', '') = '' THEN
    RAISE EXCEPTION 'A Close lead link is required';
  END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Add the prospect''s email and check the spelling';
  END IF;
  IF v_choice NOT IN ('video', 'phone') THEN
    RAISE EXCEPTION 'Pick a video call or a callback';
  END IF;
  IF v_client IS NULL OR NOT EXISTS (SELECT 1 FROM public.trial_active_clients() t WHERE t.id = v_client) THEN
    RAISE EXCEPTION 'That is not a client you are representing';
  END IF;
  IF v_choice = 'phone' THEN
    IF trim(coalesce(_payload->>'contact_mobile', '')) = '' THEN
      RAISE EXCEPTION 'A callback needs their mobile number';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.booking_event_types e
                   WHERE e.client_id = v_client AND e.is_active AND e.offer_phone_choice) THEN
      RAISE EXCEPTION 'This client does not take callbacks';
    END IF;
  END IF;

  SELECT array_agg(t ORDER BY n) INTO v_times
  FROM (
    SELECT DISTINCT ON (t) t, n
    FROM jsonb_array_elements_text(coalesce(_payload->'chosen_times', '[]'::jsonb)) WITH ORDINALITY AS e(v, n),
         LATERAL (SELECT e.v::timestamptz AS t) x
    ORDER BY t, n
  ) d;
  IF coalesce(array_length(v_times, 1), 0) < 2 THEN
    RAISE EXCEPTION 'Pick the time they want, then at least one more';
  END IF;
  IF array_length(v_times, 1) > 3 THEN
    RAISE EXCEPTION 'Pick three times at most';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
           'date', to_char(t AT TIME ZONE 'Europe/London', 'YYYY-MM-DD'),
           'time', to_char(t AT TIME ZONE 'Europe/London', 'HH24:MI')) ORDER BY n)
    INTO v_proposed
  FROM unnest(v_times) WITH ORDINALITY AS u(t, n);

  INSERT INTO public.trial_leads (
    candidate_id, trialist_user_id, client_profile_id, close_lead_link,
    company_name, company_website, contact_name, contact_title, contact_mobile, contact_email, linkedin_url,
    currently_hiring, job_roles, job_spec_provided,
    open_to_receiving_cvs, cv_candidate_titles, cv_candidate_level,
    other_decision_makers, decision_maker_status, decision_maker_email,
    push_through_reason, proposed_times, trialist_notes,
    location_choice, chosen_times
  ) VALUES (
    v_candidate, auth.uid(), v_client, _payload->>'close_lead_link',
    _payload->>'company_name', _payload->>'company_website', _payload->>'contact_name', _payload->>'contact_title',
    _payload->>'contact_mobile', v_email, _payload->>'linkedin_url',
    (_payload->>'currently_hiring')::boolean, coalesce(_payload->'job_roles', '[]'::jsonb), (_payload->>'job_spec_provided')::boolean,
    (_payload->>'open_to_receiving_cvs')::boolean, _payload->>'cv_candidate_titles', _payload->>'cv_candidate_level',
    (_payload->>'other_decision_makers')::boolean, NULLIF(_payload->>'decision_maker_status', ''), _payload->>'decision_maker_email',
    _payload->>'push_through_reason', v_proposed, _payload->>'trialist_notes',
    v_choice, v_times
  ) RETURNING id INTO v_id;

  SELECT coalesce(NULLIF(full_name, ''), email) INTO v_name FROM public.profiles WHERE id = auth.uid();
  SELECT company_name INTO v_client_name FROM public.client_profiles WHERE id = v_client;
  INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
  VALUES ('ops', NULL, 'Trialist lead to review',
          coalesce(v_name, 'A trialist') || ' logged ' || coalesce(_payload->>'company_name', 'a lead')
            || ' for ' || coalesce(v_client_name, 'a client') || '. Listen to the call, then book it or mark it not a fit.',
          'meeting', '/ops-command/trialist-leads', auth.uid());
  RETURN v_id;
END;
$function$;

-- Proof: the two columns, the check, and the function now asks for an email.
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trial_leads'
     AND column_name IN ('location_choice', 'chosen_times')) AS columns_expect_2,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'trial_leads_location_choice_check') AS check_expect_1,
  (SELECT position('check the spelling' IN pg_get_functiondef('public.submit_trial_lead(jsonb)'::regprocedure)) > 0) AS email_rule_live;
