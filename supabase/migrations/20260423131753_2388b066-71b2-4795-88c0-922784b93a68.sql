-- ============================================================
-- Make task materialization respect form pop-up settings.
-- When a form (SOD / EOD / Hourly) is disabled in dev settings,
-- DO NOT create task_instances for those form-linked templates,
-- and clean up any existing OPEN instances so they don't flip
-- to "missed" in the UI.
-- ============================================================

CREATE OR REPLACE FUNCTION public.materialize_task_instances(p_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_dow int;
  v_dom int;
  v_sod_enabled boolean;
  v_sod_roles text[];
  v_eod_enabled boolean;
  v_eod_roles text[];
  v_hourly_enabled boolean;
  v_hourly_roles text[];
BEGIN
  v_dow := EXTRACT(DOW FROM p_date)::int;
  v_dom := EXTRACT(DAY FROM p_date)::int;

  SELECT COALESCE(enabled, false), COALESCE(target_roles, '{}')
    INTO v_sod_enabled, v_sod_roles
  FROM public.start_of_day_settings LIMIT 1;

  SELECT COALESCE(enabled, false), COALESCE(target_roles, '{}')
    INTO v_eod_enabled, v_eod_roles
  FROM public.eod_settings LIMIT 1;

  SELECT COALESCE(enabled, false), COALESCE(target_roles, '{}')
    INTO v_hourly_enabled, v_hourly_roles
  FROM public.hourly_update_settings LIMIT 1;

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
      -- SOD: skip if disabled, or if no targeted user role intersects
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
      -- EOD: same gate
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
      -- Hourly: same gate
      AND (
        ea.link_type IS NULL
        OR ea.link_type NOT LIKE 'form_hourly_%'
        OR (
          v_hourly_enabled
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = ea.target_user_id
              AND ur.role::text = ANY (v_hourly_roles)
          )
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
$$;

-- ============================================================
-- Cleanup: remove today/future OPEN form-linked instances for
-- any form that is currently disabled, so users don't see them
-- as "missed" in the Tasks tab while pop-ups are paused.
-- (Done instances are left intact for historical accuracy.)
-- ============================================================
DO $$
DECLARE
  v_sod_enabled boolean;
  v_eod_enabled boolean;
  v_hourly_enabled boolean;
BEGIN
  SELECT COALESCE(enabled,false) INTO v_sod_enabled FROM public.start_of_day_settings LIMIT 1;
  SELECT COALESCE(enabled,false) INTO v_eod_enabled FROM public.eod_settings LIMIT 1;
  SELECT COALESCE(enabled,false) INTO v_hourly_enabled FROM public.hourly_update_settings LIMIT 1;

  IF NOT v_sod_enabled THEN
    DELETE FROM public.task_instances
    WHERE link_type = 'form_sod'
      AND status = 'open'
      AND due_date >= CURRENT_DATE;
  END IF;

  IF NOT v_eod_enabled THEN
    DELETE FROM public.task_instances
    WHERE link_type = 'form_eod'
      AND status = 'open'
      AND due_date >= CURRENT_DATE;
  END IF;

  IF NOT v_hourly_enabled THEN
    DELETE FROM public.task_instances
    WHERE link_type LIKE 'form_hourly_%'
      AND status = 'open'
      AND due_date >= CURRENT_DATE;
  END IF;
END $$;

-- Re-materialize today so any non-form templates fill in,
-- now respecting the disabled-form gates.
SELECT public.materialize_task_instances(CURRENT_DATE);
