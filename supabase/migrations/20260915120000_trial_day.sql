-- Trial Day (15 Sep 2026, core team call): the final hiring stage becomes a
-- real Trial Day on live client campaigns. Trialists log meeting-ready leads
-- in a one-button portal; Daniel (CSM) reviews and pushes them to any
-- fulfilment setter (or books them himself); the setter converts the lead
-- through the normal Log Appointment flow. Elena runs it from a new
-- 'trial_day' stage between Final Interview and Offer.
--
-- TWO PASTES in the hosted SQL editor. Postgres refuses to USE a new enum
-- value in the transaction that added it, so:
--   PART 1 = the single ALTER TYPE line (run it alone, wait for "Success").
--   PART 2 = everything below the PART 2 marker.
-- Safe to run twice. Ends with a SELECT that proves what landed.

-- ═══════════════════════════ PART 1 ═══════════════════════════════════════
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'trialist';

-- ═══════════════════════════ PART 2 ═══════════════════════════════════════

-- 1. Containment flag: mirrors profiles.in_onboarding_mode. While true the
--    app shows only /trial and blocks every role route.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS in_trial_mode boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.in_trial_mode IS
  'When true, the app shows only the trialist surface (/trial) and blocks every role route. Set by create-user for trialists; cleared by end_trial_access or trialist_to_onboarding.';

-- 2. Candidate columns + the new stage.
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS trial_day_date date,
  ADD COLUMN IF NOT EXISTS trialist_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_status_check;
ALTER TABLE public.candidates ADD CONSTRAINT candidates_status_check
  CHECK (status = ANY (ARRAY['pending','passed','failed','invited_to_interview','on_trial','in_onboarding','hired','left']));

ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_stage_key_check;
ALTER TABLE public.candidates ADD CONSTRAINT candidates_stage_key_check
  CHECK (stage_key IS NULL OR stage_key IN (
    'screening', 'booked', 'lct_passed', 'lct_failed', 'final_interview', 'trial_day',
    'offer', 'onboarding', 'hired', 'not_suitable', 'bypass', 'left'
  ));

-- Legacy-sync trigger learns the stage: same board column as Final Interview
-- (3), status 'on_trial', date stamped from trial_day_date when present.
CREATE OR REPLACE FUNCTION public.candidates_sync_legacy_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mapped_stage integer;
BEGIN
  IF NEW.stage_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage_key IS NOT DISTINCT FROM OLD.stage_key THEN
    RETURN NEW;
  END IF;

  v_mapped_stage := CASE NEW.stage_key
    WHEN 'booked'          THEN 1
    WHEN 'lct_passed'      THEN 2
    WHEN 'lct_failed'      THEN 2
    WHEN 'final_interview' THEN 3
    WHEN 'trial_day'       THEN 3
    WHEN 'offer'           THEN 4
    WHEN 'onboarding'      THEN 5
    WHEN 'hired'           THEN 5
    ELSE NULL
  END;

  IF v_mapped_stage IS NOT NULL THEN
    NEW.pipeline_stage := GREATEST(COALESCE(NEW.pipeline_stage, 0), v_mapped_stage);
  END IF;

  IF NEW.stage_key IN ('lct_passed', 'lct_failed') THEN
    NEW.ceo_trial_call_date := COALESCE(NEW.ceo_trial_call_date, CURRENT_DATE);
  ELSIF NEW.stage_key = 'offer' THEN
    NEW.offer_letter_date   := COALESCE(NEW.offer_letter_date, CURRENT_DATE);
  ELSIF NEW.stage_key = 'hired' THEN
    NEW.accepted_date       := COALESCE(NEW.accepted_date, CURRENT_DATE);
  END IF;

  NEW.status := CASE NEW.stage_key
    WHEN 'lct_passed'      THEN 'passed'
    WHEN 'lct_failed'      THEN 'failed'
    WHEN 'final_interview' THEN 'invited_to_interview'
    WHEN 'trial_day'       THEN 'on_trial'
    WHEN 'onboarding'      THEN 'in_onboarding'
    WHEN 'hired'           THEN 'hired'
    WHEN 'left'            THEN 'left'
    WHEN 'booked'          THEN COALESCE(NEW.status, 'pending')
    ELSE NEW.status
  END;

  NEW.stage_changed_at := now();

  RETURN NEW;
END;
$function$;

-- 3. The leads a trialist logs. Same qualification columns as meetings so a
--    conversion is a column-for-column copy.
CREATE TABLE IF NOT EXISTS public.trial_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  trialist_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_profile_id uuid REFERENCES public.client_profiles(id) ON DELETE SET NULL,
  close_lead_link text NOT NULL,
  company_name text,
  company_website text,
  contact_name text,
  contact_title text,
  contact_mobile text,
  contact_email text,
  linkedin_url text,
  currently_hiring boolean,
  job_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  job_spec_provided boolean,
  open_to_receiving_cvs boolean,
  cv_candidate_titles text,
  cv_candidate_level text,
  other_decision_makers boolean,
  decision_maker_status text
    CHECK (decision_maker_status IS NULL OR decision_maker_status IN ('joining','briefed_by_prospect','email_pending')),
  decision_maker_email text,
  push_through_reason text,
  proposed_times jsonb NOT NULL DEFAULT '[]'::jsonb,
  trialist_notes text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','pushed','converted','rejected')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  pushed_to_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  pushed_at timestamptz,
  converted_meeting_id uuid,
  converted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trial_leads_status_idx ON public.trial_leads (status);
CREATE INDEX IF NOT EXISTS trial_leads_pushed_to_idx ON public.trial_leads (pushed_to_user_id) WHERE pushed_to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trial_leads_trialist_idx ON public.trial_leads (trialist_user_id);

DROP TRIGGER IF EXISTS trial_leads_set_updated_at ON public.trial_leads;
CREATE TRIGGER trial_leads_set_updated_at
  BEFORE UPDATE ON public.trial_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS trial_lead_id uuid REFERENCES public.trial_leads(id) ON DELETE SET NULL;
ALTER TABLE public.trial_leads
  DROP CONSTRAINT IF EXISTS trial_leads_converted_meeting_fk,
  ADD CONSTRAINT trial_leads_converted_meeting_fk
    FOREIGN KEY (converted_meeting_id) REFERENCES public.meetings(id) ON DELETE SET NULL;

ALTER TABLE public.trial_leads ENABLE ROW LEVEL SECURITY;

-- Who reviews: CSM, admin, dev, ops, hr, sdr_manager (Elena's trial review
-- and Marcus's oversight included).
DROP POLICY IF EXISTS "Trial leads: reviewers manage" ON public.trial_leads;
CREATE POLICY "Trial leads: reviewers manage" ON public.trial_leads
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'csm'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
    OR public.has_capability(auth.uid(), 'can_screen_candidates')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'csm'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
    OR public.has_capability(auth.uid(), 'can_screen_candidates')
  );

-- The trialist sees only their own rows (inserts go through submit_trial_lead).
DROP POLICY IF EXISTS "Trial leads: trialist reads own" ON public.trial_leads;
CREATE POLICY "Trial leads: trialist reads own" ON public.trial_leads
  FOR SELECT TO authenticated
  USING (trialist_user_id = auth.uid());

-- A setter sees what was pushed to them and may mark it converted.
DROP POLICY IF EXISTS "Trial leads: setter reads pushed" ON public.trial_leads;
CREATE POLICY "Trial leads: setter reads pushed" ON public.trial_leads
  FOR SELECT TO authenticated
  USING (pushed_to_user_id = auth.uid());
DROP POLICY IF EXISTS "Trial leads: setter converts pushed" ON public.trial_leads;
CREATE POLICY "Trial leads: setter converts pushed" ON public.trial_leads
  FOR UPDATE TO authenticated
  USING (pushed_to_user_id = auth.uid())
  WITH CHECK (pushed_to_user_id = auth.uid());

-- 4. Portal briefing settings (one row). Dev Centre → Trialist access edits
--    it; every signed-in user can read it (the trialist must).
CREATE TABLE IF NOT EXISTS public.trial_day_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  intro_title text NOT NULL DEFAULT 'How today works',
  intro_body text NOT NULL DEFAULT E'1. Dial the list your team lead gave you in Close.\n2. When a prospect is hiring or open to CVs, log it here with the Close link.\n3. Give two or three times they could meet. Your team lead calls them back to confirm.',
  doc_url text,
  doc_label text NOT NULL DEFAULT 'Trial-day briefing',
  video_url text,
  video_label text NOT NULL DEFAULT 'Close walkthrough',
  embed_mode boolean NOT NULL DEFAULT false,
  embed_video_url text,
  embed_title text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.trial_day_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.trial_day_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Trial settings: everyone reads" ON public.trial_day_settings;
CREATE POLICY "Trial settings: everyone reads" ON public.trial_day_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Trial settings: staff edit" ON public.trial_day_settings;
CREATE POLICY "Trial settings: staff edit" ON public.trial_day_settings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_capability(auth.uid(), 'can_screen_candidates')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_capability(auth.uid(), 'can_screen_candidates')
  );

-- 5. What the trialist may see of the company: active clients, by name only.
CREATE OR REPLACE FUNCTION public.trial_active_clients()
RETURNS TABLE (id uuid, company_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.company_name
  FROM public.client_profiles c
  WHERE c.status = 'active'
    AND auth.uid() IS NOT NULL
  ORDER BY c.company_name;
$$;

-- 6. The one write a trialist makes. Finds their candidate row, inserts the
--    lead, and rings the CSM bell. SECURITY DEFINER so the trialist needs no
--    policy on candidates or notifications.
CREATE OR REPLACE FUNCTION public.submit_trial_lead(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate uuid;
  v_id uuid;
  v_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'trialist'::public.app_role) THEN
    RAISE EXCEPTION 'Only a trialist can log a trial lead';
  END IF;
  SELECT id INTO v_candidate FROM public.candidates
   WHERE trialist_user_id = auth.uid()
   ORDER BY stage_changed_at DESC NULLS LAST LIMIT 1;
  IF v_candidate IS NULL THEN
    RAISE EXCEPTION 'No trial candidate is linked to this login';
  END IF;
  IF COALESCE(_payload->>'close_lead_link','') = '' THEN
    RAISE EXCEPTION 'A Close lead link is required';
  END IF;
  IF jsonb_array_length(COALESCE(_payload->'proposed_times','[]'::jsonb)) < 2 THEN
    RAISE EXCEPTION 'Give at least two times the prospect could meet';
  END IF;

  INSERT INTO public.trial_leads (
    candidate_id, trialist_user_id, client_profile_id, close_lead_link,
    company_name, company_website, contact_name, contact_title, contact_mobile, contact_email, linkedin_url,
    currently_hiring, job_roles, job_spec_provided,
    open_to_receiving_cvs, cv_candidate_titles, cv_candidate_level,
    other_decision_makers, decision_maker_status, decision_maker_email,
    push_through_reason, proposed_times, trialist_notes
  ) VALUES (
    v_candidate, auth.uid(), NULLIF(_payload->>'client_profile_id','')::uuid, _payload->>'close_lead_link',
    _payload->>'company_name', _payload->>'company_website', _payload->>'contact_name', _payload->>'contact_title',
    _payload->>'contact_mobile', _payload->>'contact_email', _payload->>'linkedin_url',
    (_payload->>'currently_hiring')::boolean, COALESCE(_payload->'job_roles','[]'::jsonb), (_payload->>'job_spec_provided')::boolean,
    (_payload->>'open_to_receiving_cvs')::boolean, _payload->>'cv_candidate_titles', _payload->>'cv_candidate_level',
    (_payload->>'other_decision_makers')::boolean, NULLIF(_payload->>'decision_maker_status',''), _payload->>'decision_maker_email',
    _payload->>'push_through_reason', COALESCE(_payload->'proposed_times','[]'::jsonb), _payload->>'trialist_notes'
  ) RETURNING id INTO v_id;

  SELECT COALESCE(NULLIF(full_name,''), email) INTO v_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
  VALUES ('csm', NULL, 'Trialist lead to review',
          COALESCE(v_name,'A trialist') || ' logged ' || COALESCE(_payload->>'company_name','a lead') || ' — open it, listen to the call, then push it to a setter.',
          'meeting', '/csm/meetings?tab=trialist', auth.uid());
  RETURN v_id;
END;
$$;

-- 7. Elena's controls on the candidate card. SECURITY DEFINER because the TA
--    has no UPDATE policy on profiles or user_roles (same reason as
--    release_onboarding).
CREATE OR REPLACE FUNCTION public.end_trial_access(_candidate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF NOT (
    public.has_capability(auth.uid(), 'can_screen_candidates')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not allowed: ending trial access needs the TA capability or admin/dev/hr/ops';
  END IF;
  SELECT trialist_user_id INTO v_user FROM public.candidates WHERE id = _candidate_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'This candidate has no trialist login';
  END IF;
  UPDATE public.profiles SET in_trial_mode = false, offboarded_at = COALESCE(offboarded_at, now()) WHERE id = v_user;
  DELETE FROM public.user_roles WHERE user_id = v_user AND role = 'trialist'::public.app_role;
END;
$$;

-- 7b. Review actions. SECURITY DEFINER so the bell notification can be
--     written (notifications INSERT is service-role only since May) and so a
--     setter's "converted" write is validated server-side.
CREATE OR REPLACE FUNCTION public.push_trial_lead(_lead_id uuid, _setter_user_id uuid, _note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.trial_leads%ROWTYPE;
  v_reviewer text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'csm'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
    OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not allowed: pushing a trial lead needs csm/admin/dev/ops/sdr_manager';
  END IF;
  SELECT * INTO v_lead FROM public.trial_leads WHERE id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trial lead not found'; END IF;
  IF v_lead.status = 'converted' THEN RAISE EXCEPTION 'This lead is already converted'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.setters_profiles WHERE user_id = _setter_user_id AND active = true) THEN
    RAISE EXCEPTION 'That setter is not active';
  END IF;

  UPDATE public.trial_leads
     SET status = 'pushed', pushed_to_user_id = _setter_user_id, pushed_at = now(),
         reviewed_by = auth.uid(), reviewed_at = now(), review_notes = NULLIF(_note, '')
   WHERE id = _lead_id;

  SELECT COALESCE(NULLIF(full_name,''), email) INTO v_reviewer FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
  VALUES ('setter', _setter_user_id, 'A lead was pushed to you',
          COALESCE(v_reviewer,'Your CSM') || ' pushed ' || COALESCE(v_lead.company_name,'a trialist lead') || ' to you — open Appointments to book it.',
          'meeting', '/setter/meetings', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_trial_lead(_lead_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'csm'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
    OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not allowed: rejecting a trial lead needs csm/admin/dev/ops/sdr_manager';
  END IF;
  UPDATE public.trial_leads
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = NULLIF(_reason, ''),
         pushed_to_user_id = NULL, pushed_at = NULL
   WHERE id = _lead_id AND status <> 'converted';
  IF NOT FOUND THEN RAISE EXCEPTION 'Trial lead not found or already converted'; END IF;
END;
$$;

-- Called by whoever logs the meeting from the lead (the pushed setter, or a
-- reviewer booking it themselves). Links both ways.
CREATE OR REPLACE FUNCTION public.convert_trial_lead(_lead_id uuid, _meeting_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.trial_leads%ROWTYPE;
  v_reviewer boolean;
BEGIN
  SELECT * INTO v_lead FROM public.trial_leads WHERE id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trial lead not found'; END IF;
  v_reviewer := public.has_role(auth.uid(), 'csm'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
    OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role);
  IF NOT (v_reviewer OR v_lead.pushed_to_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed: only the setter this lead was pushed to, or a reviewer, can convert it';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.meetings WHERE id = _meeting_id) THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;
  UPDATE public.trial_leads
     SET status = 'converted', converted_meeting_id = _meeting_id, converted_by = auth.uid(), converted_at = now(),
         reviewed_by = COALESCE(reviewed_by, auth.uid()), reviewed_at = COALESCE(reviewed_at, now())
   WHERE id = _lead_id;
  UPDATE public.meetings SET trial_lead_id = _lead_id WHERE id = _meeting_id;
END;
$$;

-- Passed the trial: the SAME login walks into onboarding. Flags flip, the
-- trialist role is swapped for the target role, and the onboarding record
-- links to the existing user. Email stays personal until Elena changes it.
CREATE OR REPLACE FUNCTION public.trialist_to_onboarding(_candidate_id uuid, _onboarding_id uuid, _target_role text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_role public.app_role;
BEGIN
  IF NOT (
    public.has_capability(auth.uid(), 'can_screen_candidates')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not allowed: moving a trialist into onboarding needs the TA capability or admin/dev/hr/ops';
  END IF;
  SELECT trialist_user_id INTO v_user FROM public.candidates WHERE id = _candidate_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'This candidate has no trialist login';
  END IF;
  v_role := CASE _target_role
    WHEN 'setter_fulfilment'  THEN 'setter'::public.app_role
    WHEN 'setter_acquisition' THEN 'setter'::public.app_role
    WHEN 'account_executive'  THEN 'account_executive'::public.app_role
    WHEN 'operations'         THEN 'ops'::public.app_role
    ELSE NULL
  END;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unknown onboarding target role %', _target_role;
  END IF;

  UPDATE public.profiles SET in_trial_mode = false, in_onboarding_mode = true, offboarded_at = NULL WHERE id = v_user;
  DELETE FROM public.user_roles WHERE user_id = v_user AND role = 'trialist'::public.app_role;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, v_role) ON CONFLICT DO NOTHING;
  UPDATE public.employee_onboarding
     SET user_id = v_user, onboarding_state = 'in_onboarding', started_at = COALESCE(started_at, now())
   WHERE id = _onboarding_id;
  RETURN v_user;
END;
$$;

-- 8. Proof.
SELECT
  'trialist' = ANY(enum_range(NULL::public.app_role)::text[])                                   AS role_ok,
  to_regclass('public.trial_leads') IS NOT NULL                                                  AS leads_table_ok,
  to_regclass('public.trial_day_settings') IS NOT NULL                                           AS settings_table_ok,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles'   AND column_name='in_trial_mode')    AS flag_ok,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='candidates' AND column_name='trial_day_date')   AS stage_cols_ok,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meetings'   AND column_name='trial_lead_id')    AS meetings_col_ok,
  (SELECT count(*) FROM pg_proc WHERE proname IN ('submit_trial_lead','end_trial_access','trialist_to_onboarding','trial_active_clients','push_trial_lead','reject_trial_lead','convert_trial_lead')) AS functions_ok;
