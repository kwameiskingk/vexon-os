-- hourly_updates.hour_slot is the actual clock hour (10..17)
-- task_instances.link_slot is a 1..8 index where 1=10AM, 2=11AM, ... 8=5PM
-- Map hour -> slot index by subtracting 9.
CREATE OR REPLACE FUNCTION public.tg_complete_hourly_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slot int;
BEGIN
  v_slot := NEW.hour_slot - 9;
  PERFORM public.complete_linked_task(
    NEW.user_id,
    'form_hourly_' || v_slot::text,
    v_slot,
    COALESCE(NEW.date, CURRENT_DATE)
  );
  RETURN NEW;
END;
$function$;

-- Backfill: mark any task_instances done for hourly_updates that already exist today
UPDATE public.task_instances ti
SET status = 'done',
    completed_at = COALESCE(hu.submitted_at_uk, now()),
    auto_completed = true
FROM public.hourly_updates hu
WHERE ti.assigned_to_user_id = hu.user_id
  AND ti.due_date = hu.date
  AND ti.link_type = 'form_hourly_' || (hu.hour_slot - 9)::text
  AND ti.link_slot = hu.hour_slot - 9
  AND ti.status = 'open'
  AND hu.date >= CURRENT_DATE - INTERVAL '7 days';