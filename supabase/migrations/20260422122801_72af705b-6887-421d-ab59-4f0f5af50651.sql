CREATE OR REPLACE FUNCTION public.complete_linked_task(p_user uuid, p_link_type text, p_link_slot integer DEFAULT NULL::integer, p_date date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.task_instances
  SET status = 'done',
      completed_at = COALESCE(completed_at, now()),
      auto_completed = true
  WHERE assigned_to_user_id = p_user
    AND link_type = p_link_type
    AND COALESCE(link_slot, -1) = COALESCE(p_link_slot, -1)
    AND due_date = p_date
    AND status <> 'done';
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_complete_hourly_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.complete_linked_task(
    NEW.user_id,
    'form_hourly_' || NEW.hour_slot::text,
    NEW.hour_slot,
    COALESCE(NEW.date, CURRENT_DATE)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_complete_sod_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.missed, false) = false THEN
    PERFORM public.complete_linked_task(
      NEW.user_id,
      'form_sod',
      NULL,
      COALESCE(NEW.date, CURRENT_DATE)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_complete_sod_task ON public.start_of_day_submissions;
CREATE TRIGGER tg_complete_sod_task
AFTER INSERT ON public.start_of_day_submissions
FOR EACH ROW
EXECUTE FUNCTION public.tg_complete_sod_task();

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
    SELECT EXISTS (
      SELECT 1
      FROM public.hourly_updates hu
      WHERE hu.user_id = NEW.assigned_to_user_id
        AND hu.date = NEW.due_date
        AND hu.hour_slot = NEW.link_slot
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