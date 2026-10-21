-- ============================================================
-- Tasks & Responsibilities System
-- ============================================================

-- 1. Extend tasks table to support templates + recurrence + linkage
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS link_type text,
  ADD COLUMN IF NOT EXISTS link_slot int,
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'once',
  ADD COLUMN IF NOT EXISTS recurrence_day int,
  ADD COLUMN IF NOT EXISTS target_role public.app_role,
  ADD COLUMN IF NOT EXISTS target_department text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'task',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS due_time time,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Drop the old strict department check; we now allow any department string (or null for templates)
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_department_check;
ALTER TABLE public.tasks ALTER COLUMN department DROP NOT NULL;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_recurrence_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_recurrence_check
  CHECK (recurrence IN ('once','daily','weekly','monthly'));

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_category_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_category_check
  CHECK (category IN ('task','responsibility'));

-- created_by_user_id needs to be nullable for system-seeded templates
ALTER TABLE public.tasks ALTER COLUMN created_by_user_id DROP NOT NULL;

-- 2. task_assignments — links a template to recipients
CREATE TABLE IF NOT EXISTS public.task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  assigned_role public.app_role,
  assigned_department text,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (assigned_role IS NOT NULL OR assigned_department IS NOT NULL OR assigned_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_task_assignments_template ON public.task_assignments(template_task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_role ON public.task_assignments(assigned_role) WHERE assigned_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON public.task_assignments(assigned_user_id) WHERE assigned_user_id IS NOT NULL;

ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;

-- 3. task_instances — daily materialized records per user
CREATE TABLE IF NOT EXISTS public.task_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.task_assignments(id) ON DELETE SET NULL,
  assigned_to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'task',
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  auto_completed boolean NOT NULL DEFAULT false,
  link_type text,
  link_slot int,
  priority text NOT NULL DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_instances_status_check CHECK (status IN ('open','done','skipped')),
  CONSTRAINT task_instances_category_check CHECK (category IN ('task','responsibility'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_instances_dedup
  ON public.task_instances(template_task_id, assigned_to_user_id, due_date, COALESCE(link_slot, -1));

CREATE INDEX IF NOT EXISTS idx_task_instances_user_date ON public.task_instances(assigned_to_user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_task_instances_link ON public.task_instances(link_type, due_date) WHERE status = 'open';

ALTER TABLE public.task_instances ENABLE ROW LEVEL SECURITY;

-- 4. responsibility_checkins
CREATE TABLE IF NOT EXISTS public.responsibility_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_instance_id uuid NOT NULL REFERENCES public.task_instances(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE INDEX IF NOT EXISTS idx_responsibility_checkins_instance ON public.responsibility_checkins(task_instance_id);

ALTER TABLE public.responsibility_checkins ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- tasks (templates + personal): drop and recreate cleanly for new schema
DROP POLICY IF EXISTS "Admin roles can manage all tasks" ON public.tasks;
DROP POLICY IF EXISTS "Setters can create tasks for themselves" ON public.tasks;
DROP POLICY IF EXISTS "Setters can update their own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Setters can view tasks assigned to them" ON public.tasks;

CREATE POLICY "Admin roles full access on tasks"
  ON public.tasks FOR ALL TO authenticated
  USING (public.is_admin_role(auth.uid()) OR public.has_sdr_manager_role(auth.uid()))
  WITH CHECK (public.is_admin_role(auth.uid()) OR public.has_sdr_manager_role(auth.uid()));

CREATE POLICY "Authenticated can read templates"
  ON public.tasks FOR SELECT TO authenticated
  USING (is_template = true AND active = true);

CREATE POLICY "Users manage their own personal tasks"
  ON public.tasks FOR ALL TO authenticated
  USING (
    is_template = false
    AND created_by_user_id = auth.uid()
    AND (assigned_to_user_id IS NULL OR assigned_to_user_id = auth.uid())
  )
  WITH CHECK (
    is_template = false
    AND created_by_user_id = auth.uid()
    AND (assigned_to_user_id IS NULL OR assigned_to_user_id = auth.uid())
  );

CREATE POLICY "Users see tasks assigned to them"
  ON public.tasks FOR SELECT TO authenticated
  USING (assigned_to_user_id = auth.uid());

-- task_assignments
CREATE POLICY "Admins manage assignments"
  ON public.task_assignments FOR ALL TO authenticated
  USING (public.is_admin_role(auth.uid()) OR public.has_sdr_manager_role(auth.uid()))
  WITH CHECK (public.is_admin_role(auth.uid()) OR public.has_sdr_manager_role(auth.uid()));

CREATE POLICY "Users see assignments targeting them"
  ON public.task_assignments FOR SELECT TO authenticated
  USING (assigned_user_id = auth.uid() OR assigned_role IN (SELECT role FROM public.user_roles WHERE user_id = auth.uid()));

-- task_instances
CREATE POLICY "Users manage own instances"
  ON public.task_instances FOR ALL TO authenticated
  USING (assigned_to_user_id = auth.uid())
  WITH CHECK (assigned_to_user_id = auth.uid());

CREATE POLICY "Admins read all instances"
  ON public.task_instances FOR SELECT TO authenticated
  USING (public.is_admin_role(auth.uid()) OR public.has_sdr_manager_role(auth.uid()) OR public.is_hr_role(auth.uid()));

CREATE POLICY "Admins write all instances"
  ON public.task_instances FOR ALL TO authenticated
  USING (public.is_admin_role(auth.uid()) OR public.has_sdr_manager_role(auth.uid()))
  WITH CHECK (public.is_admin_role(auth.uid()) OR public.has_sdr_manager_role(auth.uid()));

-- responsibility_checkins
CREATE POLICY "Users manage own checkins"
  ON public.responsibility_checkins FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins read checkins"
  ON public.responsibility_checkins FOR SELECT TO authenticated
  USING (public.is_admin_role(auth.uid()) OR public.has_sdr_manager_role(auth.uid()));

-- ============================================================
-- Updated-at triggers
-- ============================================================
DROP TRIGGER IF EXISTS update_task_assignments_updated_at ON public.task_assignments;
CREATE TRIGGER update_task_assignments_updated_at
  BEFORE UPDATE ON public.task_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_task_instances_updated_at ON public.task_instances;
CREATE TRIGGER update_task_instances_updated_at
  BEFORE UPDATE ON public.task_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Materialization function
-- Generates task_instances for a given date based on active assignments
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
BEGIN
  v_dow := EXTRACT(DOW FROM p_date)::int;  -- 0=Sun..6=Sat
  v_dom := EXTRACT(DAY FROM p_date)::int;

  -- For each (assignment, target user) materialize one instance per template per slot
  -- Slots: hourly form templates have link_slot 1..7; everything else slot=null
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
    -- Resolve target users
    CROSS JOIN LATERAL (
      SELECT DISTINCT user_id FROM (
        -- direct user assignment
        SELECT ta.assigned_user_id AS user_id WHERE ta.assigned_user_id IS NOT NULL
        UNION ALL
        -- role assignment
        SELECT ur.user_id FROM public.user_roles ur
          WHERE ta.assigned_role IS NOT NULL AND ur.role = ta.assigned_role
        UNION ALL
        -- department assignment via user_department_access
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
  with_slots AS (
    SELECT
      ea.*,
      CASE
        WHEN ea.link_type LIKE 'form_hourly_%' THEN
          NULLIF(REGEXP_REPLACE(ea.link_type, 'form_hourly_', ''), '')::int
        ELSE NULL
      END AS slot
    FROM expanded_assignments ea
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
-- Auto-completion helper + triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_linked_task(
  p_user uuid,
  p_link_type text,
  p_link_slot int DEFAULT NULL,
  p_date date DEFAULT CURRENT_DATE
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.task_instances
  SET status = 'done',
      completed_at = now(),
      auto_completed = true
  WHERE assigned_to_user_id = p_user
    AND link_type = p_link_type
    AND COALESCE(link_slot, -1) = COALESCE(p_link_slot, -1)
    AND due_date = p_date
    AND status = 'open';
END;
$$;

-- Hourly updates → form_hourly_<slot>
CREATE OR REPLACE FUNCTION public.tg_complete_hourly_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.complete_linked_task(
    NEW.user_id,
    'form_hourly_' || NEW.slot::text,
    NEW.slot,
    COALESCE(NEW.local_date, CURRENT_DATE)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_complete_hourly_task ON public.hourly_updates;
CREATE TRIGGER tg_complete_hourly_task
  AFTER INSERT ON public.hourly_updates
  FOR EACH ROW EXECUTE FUNCTION public.tg_complete_hourly_task();

-- Setter feedback (EOD) → form_eod
CREATE OR REPLACE FUNCTION public.tg_complete_eod_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.complete_linked_task(NEW.user_id, 'form_eod', NULL, COALESCE(NEW.feedback_date, CURRENT_DATE));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_complete_eod_task ON public.setter_feedback;
CREATE TRIGGER tg_complete_eod_task
  AFTER INSERT ON public.setter_feedback
  FOR EACH ROW EXECUTE FUNCTION public.tg_complete_eod_task();

-- Meetings → meeting_log (uses logged_by_setter_id when present)
CREATE OR REPLACE FUNCTION public.tg_complete_meeting_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.complete_linked_task(
    COALESCE(NEW.logged_by_setter_id, NEW.setter_id),
    'meeting_log',
    NULL,
    COALESCE(NEW.created_at::date, CURRENT_DATE)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_complete_meeting_task ON public.meetings;
CREATE TRIGGER tg_complete_meeting_task
  AFTER INSERT ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.tg_complete_meeting_task();

-- ============================================================
-- Notification on instance assignment
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_task_instance_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF NEW.category = 'responsibility' THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_role FROM public.user_roles WHERE user_id = NEW.assigned_to_user_id LIMIT 1;
  IF v_role IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (recipient_id, recipient_role, title, message, category, link_url)
  VALUES (
    NEW.assigned_to_user_id,
    v_role,
    'New task assigned',
    NEW.title,
    'system',
    '/tasks'
  );
  RETURN NEW;
END;
$$;

-- (notification trigger is opt-in: keep it OFF for daily auto-materialization to avoid spam)
-- We'll fire notifications only for one-time / manually created instances by leaving the trigger disabled by default.

-- ============================================================
-- Seed default templates (system-owned, created_by_user_id NULL)
-- ============================================================
INSERT INTO public.tasks (
  title, description, is_template, recurrence, target_role, category, priority, link_type, due_time, active
) VALUES
  -- Setter daily
  ('Start of Day Form', 'Submit your start-of-day check-in', true, 'daily', 'setter', 'task', 'normal', 'form_sod', '09:00', true),
  ('Hourly Update — 10 AM', 'Submit hourly update for 9-10 AM slot', true, 'daily', 'setter', 'task', 'normal', 'form_hourly_1', '10:05', true),
  ('Hourly Update — 11 AM', 'Submit hourly update for 10-11 AM slot', true, 'daily', 'setter', 'task', 'normal', 'form_hourly_2', '11:05', true),
  ('Hourly Update — 12 PM', 'Submit hourly update for 11-12 slot', true, 'daily', 'setter', 'task', 'normal', 'form_hourly_3', '12:05', true),
  ('Hourly Update — 1 PM', 'Submit hourly update for 12-1 PM slot', true, 'daily', 'setter', 'task', 'normal', 'form_hourly_4', '13:05', true),
  ('Hourly Update — 2 PM', 'Submit hourly update for 1-2 PM slot', true, 'daily', 'setter', 'task', 'normal', 'form_hourly_5', '14:05', true),
  ('Hourly Update — 3 PM', 'Submit hourly update for 2-3 PM slot', true, 'daily', 'setter', 'task', 'normal', 'form_hourly_6', '15:05', true),
  ('Hourly Update — 4 PM', 'Submit hourly update for 3-4 PM slot', true, 'daily', 'setter', 'task', 'normal', 'form_hourly_7', '16:05', true),
  ('End of Day Form', 'Submit your end-of-day report', true, 'daily', 'setter', 'task', 'normal', 'form_eod', '17:30', true),
  ('Log all booked meetings', 'Ensure every meeting you booked today is logged', true, 'daily', 'setter', 'responsibility', 'normal', 'meeting_log', NULL, true),
  -- AE daily
  ('Log discovery calls', 'Record outcomes for every discovery call you ran today', true, 'daily', 'account_executive', 'task', 'normal', 'discovery_call', NULL, true),
  ('Log follow-up calls', 'Record outcomes for every follow-up call', true, 'daily', 'account_executive', 'task', 'normal', 'follow_up_call', NULL, true),
  ('Submit EOD', 'Submit your end-of-day summary', true, 'daily', 'account_executive', 'task', 'normal', 'form_eod', '17:30', true),
  -- SDR Manager
  ('Review 5 setter calls', 'Review at least 5 calls today', true, 'daily', 'sdr_manager', 'responsibility', 'normal', 'call_review', NULL, true),
  ('Run morning meeting', 'Host the morning huddle', true, 'daily', 'sdr_manager', 'task', 'normal', 'custom', '09:00', true),
  ('Submit EOD', 'Submit your end-of-day summary including calls reviewed', true, 'daily', 'sdr_manager', 'task', 'normal', 'form_eod', '17:30', true),
  -- CSM
  ('Client health review', 'Review health scores of all assigned clients', true, 'daily', 'csm', 'responsibility', 'normal', 'custom', NULL, true),
  ('Confirmation calls', 'Confirm tomorrow''s appointments', true, 'daily', 'csm', 'task', 'normal', 'confirmation_call', '16:00', true),
  -- Ops / Admin / Dev
  ('Approve pending meetings', 'Triage meetings awaiting approval', true, 'daily', 'ops', 'task', 'normal', 'custom', NULL, true),
  ('Review hourly feedback', 'Skim today''s hourly updates for support requests', true, 'daily', 'ops', 'responsibility', 'normal', 'custom', NULL, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Auto-assign seeded templates to their target role
-- ============================================================
INSERT INTO public.task_assignments (template_task_id, assigned_role, start_date, active)
SELECT t.id, t.target_role, CURRENT_DATE, true
FROM public.tasks t
WHERE t.is_template = true
  AND t.target_role IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.task_assignments ta
    WHERE ta.template_task_id = t.id AND ta.assigned_role = t.target_role
  );

-- Materialize today's instances
SELECT public.materialize_task_instances(CURRENT_DATE);