-- Hiring pipeline: a "Left" lane, 11 Sep 2026 (Elena, morning call).
--
-- People who were hired or onboarding and then resigned, were let go, or
-- never started had nowhere to go: Frans Van Zyl was hired for two hours,
-- resigned, and sat in Onboarding for a week. stage_key 'left' is a
-- terminal side lane (like not_suitable), carrying the reason in
-- exit_reason ("Resigned — …", "Let go — …", "Did not start — …").
--
-- The legacy-sync trigger derives status from stage_key; it learns the new
-- key so status reads 'left' too. Everything else it stamps is untouched.
--
-- Safe to run twice. Applied by the owner via the hosted SQL editor.

-- status is CHECK-constrained too (pending/passed/failed/invited_to_interview/
-- in_onboarding/hired); 'left' joins it so the trigger's mapping can land.
ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_status_check;
ALTER TABLE public.candidates ADD CONSTRAINT candidates_status_check
  CHECK (status = ANY (ARRAY['pending','passed','failed','invited_to_interview','in_onboarding','hired','left']));

ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_stage_key_check;
ALTER TABLE public.candidates ADD CONSTRAINT candidates_stage_key_check
  CHECK (stage_key IS NULL OR stage_key IN (
    'screening', 'booked', 'lct_passed', 'lct_failed', 'final_interview',
    'offer', 'onboarding', 'hired', 'not_suitable', 'bypass', 'left'
  ));

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
