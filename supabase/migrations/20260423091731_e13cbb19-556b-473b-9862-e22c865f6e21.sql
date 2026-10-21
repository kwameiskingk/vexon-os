-- 1. Ensure pg_cron is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Schedule daily materialization (idempotent: unschedule if exists)
DO $$
BEGIN
  PERFORM cron.unschedule('materialize-task-instances-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('materialize-task-instances-next-day');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'materialize-task-instances-daily',
  '5 0 * * *',
  $$ SELECT public.materialize_task_instances(CURRENT_DATE); $$
);

SELECT cron.schedule(
  'materialize-task-instances-next-day',
  '30 23 * * *',
  $$ SELECT public.materialize_task_instances((CURRENT_DATE + 1)); $$
);

-- 3. Restore correct hourly slot mapping in the auto-complete trigger
CREATE OR REPLACE FUNCTION public.tg_complete_hourly_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- hourly_updates.hour_slot is 10..17 (the actual hour).
  -- Task templates store link_slot 1..8 with link_type form_hourly_1..form_hourly_8.
  -- Translate hour_slot -> task slot via (hour_slot - 9).
  PERFORM public.complete_linked_task(
    NEW.user_id,
    'form_hourly_' || (NEW.hour_slot - 9)::text,
    NEW.hour_slot - 9,
    COALESCE(NEW.date, CURRENT_DATE)
  );
  RETURN NEW;
END;
$function$;

-- 4. Tighten the safety-net trigger to use the same mapping
CREATE OR REPLACE FUNCTION public.sync_task_instance_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_match boolean := false;
BEGIN
  IF NEW.category <> 'task' OR NEW.status = 'done' OR NEW.link_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.link_type = 'form_sod' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.start_of_day_submissions sod
      WHERE sod.user_id = NEW.assigned_to_user_id
        AND sod.date = NEW.due_date
        AND COALESCE(sod.missed, false) = false
    ) INTO v_has_match;
  ELSIF NEW.link_type = 'form_eod' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.setter_feedback sf
      WHERE sf.setter_id = NEW.assigned_to_user_id
        AND sf.date = NEW.due_date
    ) INTO v_has_match;
  ELSIF NEW.link_type LIKE 'form_hourly_%' THEN
    -- link_slot is 1..8, hourly_updates.hour_slot is 10..17 -> map via +9
    SELECT EXISTS (
      SELECT 1
      FROM public.hourly_updates hu
      WHERE hu.user_id = NEW.assigned_to_user_id
        AND hu.date = NEW.due_date
        AND hu.hour_slot = NEW.link_slot + 9
    ) INTO v_has_match;
  ELSIF NEW.link_type = 'meeting_log' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.meetings m
      WHERE COALESCE(m.logged_by_setter_id, m.setter_id) = NEW.assigned_to_user_id
        AND COALESCE(m.created_at::date, CURRENT_DATE) = NEW.due_date
    ) INTO v_has_match;
  END IF;

  IF v_has_match THEN
    NEW.status := 'done';
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.auto_completed := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_task_instance_completion ON public.task_instances;
CREATE TRIGGER sync_task_instance_completion
BEFORE INSERT OR UPDATE ON public.task_instances
FOR EACH ROW
EXECUTE FUNCTION public.sync_task_instance_completion();

-- 5. Backfill today's missing instances immediately
SELECT public.materialize_task_instances(CURRENT_DATE);

-- 6. Reconcile already-submitted hourly updates -> mark matching tasks done
UPDATE public.task_instances ti
SET status = 'done',
    completed_at = COALESCE(ti.completed_at, now()),
    auto_completed = true
FROM public.hourly_updates hu
WHERE ti.assigned_to_user_id = hu.user_id
  AND ti.due_date = hu.date
  AND ti.link_type LIKE 'form_hourly_%'
  AND ti.link_slot IS NOT NULL
  AND hu.hour_slot = ti.link_slot + 9
  AND ti.status <> 'done';
