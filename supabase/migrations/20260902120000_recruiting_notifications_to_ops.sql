-- Recruiting bell notifications: talent_acquisition → ops (2 Sep 2026).
-- APPLY VIA THE HOSTED SQL EDITOR (not auto-applied from this repo).
-- Idempotent: CREATE OR REPLACE + a WHERE-guarded data fix; safe to run twice.
--
-- WHY: the TA (Sofia) is being offboarded and the TA portal retired; Elena
-- (role `ops`) runs recruiting from Ops Command under her own login. The
-- notifications SELECT policy matches recipient_role via has_role(), so any
-- bell addressed to a role nobody holds is invisible forever — and the
-- CV-chase dedupe would then keep an unread row around that suppresses all
-- future chases for that candidate. Three producers address the TA role:
--   1. frontend notifyRecruiter() (useHiringPipeline.ts — fixed in app code)
--   2. notify_ta_cv_missing()      (SECURITY DEFINER fn, below)
--   3. auto_release_onboarding()   (trigger fn, below)
-- This migration re-points 2 and 3 and rescues any stranded unread rows.
-- The function KEEPS its historical name so older frontend bundles calling
-- rpc('notify_ta_cv_missing') keep working through the deploy window.

-- 1) Rescue: any unread bell still addressed to the TA role becomes an ops
--    bell, and its /ta/tracking link (query strings preserved) now lands on
--    the Ops Command hiring page. Read rows are history — left untouched.
UPDATE public.notifications
SET recipient_role = 'ops',
    link_url = replace(link_url, '/ta/tracking', '/ops-command/hiring')
WHERE recipient_role = 'talent_acquisition'
  AND is_read = false;

-- 2) CV-chase alert now bells the ops role and links to Ops Command.
--    Body otherwise identical to migration 20260821100000.
CREATE OR REPLACE FUNCTION public.notify_ta_cv_missing(
  p_candidate_id uuid,
  p_candidate_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link text := '/ops-command/hiring?cv-chase=' || p_candidate_id::text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE recipient_role = 'ops'
      AND link_url = v_link
      AND is_read = false
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications
    (category, recipient_id, recipient_role, title, message, link_url)
  VALUES (
    'system', NULL, 'ops',
    'CV missing for final interview',
    coalesce(p_candidate_name, 'A candidate')
      || ' has reached Final Interview with no CV on file — chase it up and '
      || 'upload it from their card before the interview.',
    v_link
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_ta_cv_missing(uuid, text) TO authenticated;

-- 3) Onboarding auto-release completion bell → ops role + Ops Command link.
--    Body transcribed verbatim from the live definition (pg_get_functiondef,
--    2 Sep 2026); only recipient_role and link_url change. The trigger
--    on_onboarding_tasks_auto_release is untouched — it fires this same
--    function name.
CREATE OR REPLACE FUNCTION public.auto_release_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec public.employee_onboarding%ROWTYPE;
BEGIN
  IF NEW.is_completed IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_rec FROM public.employee_onboarding WHERE id = NEW.onboarding_id;
  IF NOT FOUND OR v_rec.onboarding_state = 'completed' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employee_onboarding_tasks
    WHERE onboarding_id = NEW.onboarding_id
      AND is_completed IS NOT TRUE
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.employee_onboarding
  SET onboarding_state = 'completed',
      ended_at = now(),
      ended_by = COALESCE(auth.uid(), v_rec.user_id)
  WHERE id = NEW.onboarding_id;

  IF v_rec.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET in_onboarding_mode = false
    WHERE id = v_rec.user_id
      AND in_onboarding_mode IS TRUE;
  END IF;

  BEGIN
    INSERT INTO public.notifications
      (recipient_id, recipient_role, title, message, category, link_url)
    VALUES
      (NULL,
       'ops',
       COALESCE(v_rec.candidate_name, 'A new starter') || ' finished onboarding',
       'Every onboarding step is complete — their full dashboard has been unlocked automatically.',
       'system',
       '/ops-command/hiring');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.auto_release_onboarding() IS
  'Trigger fn: when the last employee_onboarding_task completes, marks the onboarding completed, lifts profiles.in_onboarding_mode (roster trigger fires) and bells the ops role (Elena — TA portal retired 2 Sep 2026). Marcus''s ruling: finishing the flow opens the dashboard, no human in the loop.';
