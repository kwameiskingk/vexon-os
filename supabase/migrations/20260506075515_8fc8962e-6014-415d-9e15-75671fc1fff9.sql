CREATE OR REPLACE FUNCTION public.materialize_task_instances(p_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted integer := 0;
  v_dow int;
  v_dom int;
  v_sod_enabled boolean;
  v_sod_roles text[];
  v_eod_enabled boolean;
  v_eod_roles text[];
BEGIN
  v_dow := EXTRACT(DOW FROM p_date)::int;
  v_dom := EXTRACT(DAY FROM p_date)::int;

  SELECT COALESCE(enabled, false), COALESCE(target_roles, '{}')
    INTO v_sod_enabled, v_sod_roles
  FROM public.start_of_day_settings LIMIT 1;

  SELECT COALESCE(enabled, false), COALESCE(target_roles, '{}')
    INTO v_eod_enabled, v_eod_roles
  FROM public.eod_settings LIMIT 1;

  WITH expanded_assignments AS (
    SELECT
      ta.id AS assignment_id,
      ta.template_task_id,
      t.title,
      t.description,
      t.category,
      t.priority,
      t.due_time,
      t.link_type,
      t.recurrence,
      t.recurrence_day,
      u.user_id AS target_user_id
    FROM public.task_assignments ta
    JOIN public.tasks t ON t.id = ta.template_task_id AND t.active = true
    CROSS JOIN LATERAL (
      SELECT DISTINCT user_id FROM (
        SELECT ta.assigned_user_id AS user_id WHERE ta.assigned_user_id IS NOT NULL
        UNION ALL
        SELECT ur.user_id FROM public.user_roles ur
          WHERE ta.assigned_role IS NOT NULL AND ur.role = ta.assigned_role
        UNION ALL
        SELECT uda.user_id FROM public.user_department_access uda
          WHERE ta.assigned_department IS NOT NULL AND uda.department = ta.assigned_department
      ) src
      WHERE user_id IS NOT NULL
    ) u
    WHERE ta.active = true
      AND ta.start_date <= p_date
      AND (ta.end_date IS NULL OR ta.end_date >= p_date)
      AND (
        t.recurrence = 'daily'
        OR (t.recurrence = 'weekly' AND COALESCE(t.recurrence_day, v_dow) = v_dow)
        OR (t.recurrence = 'monthly' AND COALESCE(t.recurrence_day, v_dom) = v_dom)
        OR (t.recurrence = 'once' AND ta.start_date = p_date)
      )
  ),
  filtered AS (
    SELECT ea.*
    FROM expanded_assignments ea
    WHERE
      (
        ea.link_type <> 'form_sod'
        OR (
          v_sod_enabled
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = ea.target_user_id
              AND ur.role::text = ANY (v_sod_roles)
          )
        )
      )
      AND (
        ea.link_type <> 'form_eod'
        OR (
          v_eod_enabled
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = ea.target_user_id
              AND ur.role::text = ANY (v_eod_roles)
          )
        )
      )
      -- Hourly: ONLY for setters currently on PIP
      AND (
        ea.link_type IS NULL
        OR ea.link_type NOT LIKE 'form_hourly_%'
        OR EXISTS (
          SELECT 1 FROM public.setters_profiles sp
          WHERE sp.user_id = ea.target_user_id
            AND sp.status = 'pip'
        )
      )
  ),
  with_slots AS (
    SELECT
      f.*,
      CASE
        WHEN f.link_type LIKE 'form_hourly_%' THEN
          NULLIF(REGEXP_REPLACE(f.link_type, 'form_hourly_', ''), '')::int
        ELSE NULL
      END AS slot
    FROM filtered f
  ),
  inserted AS (
    INSERT INTO public.task_instances (
      template_task_id, assignment_id, assigned_to_user_id,
      title, description, category, priority,
      due_date, due_at, link_type, link_slot
    )
    SELECT
      ws.template_task_id, ws.assignment_id, ws.target_user_id,
      ws.title, ws.description, ws.category, ws.priority,
      p_date,
      CASE WHEN ws.due_time IS NOT NULL THEN (p_date::timestamp + ws.due_time)::timestamptz ELSE NULL END,
      ws.link_type, ws.slot
    FROM with_slots ws
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_complete_hourly_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.task_instances
     SET status = 'done',
         completed_at = COALESCE(completed_at, now()),
         auto_completed = true
   WHERE assigned_to_user_id = NEW.user_id
     AND due_date = NEW.date
     AND link_type = 'form_hourly_' || (NEW.hour_slot - 9)::text
     AND status <> 'done';
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_complete_hourly_task ON public.hourly_updates;
CREATE TRIGGER tg_complete_hourly_task
  AFTER INSERT ON public.hourly_updates
  FOR EACH ROW EXECUTE FUNCTION public.tg_complete_hourly_task();

SELECT public.materialize_task_instances(CURRENT_DATE);

UPDATE public.task_instances ti
   SET status = 'done',
       completed_at = COALESCE(ti.completed_at, now()),
       auto_completed = true
  FROM public.hourly_updates hu
 WHERE ti.assigned_to_user_id = hu.user_id
   AND ti.due_date = hu.date
   AND ti.link_type = 'form_hourly_' || (hu.hour_slot - 9)::text
   AND ti.status <> 'done';