-- Allow HR/admin-level users to update employee profile HR fields such as birthday.
DROP POLICY IF EXISTS "HR roles can update employee profiles" ON public.profiles;
CREATE POLICY "HR roles can update employee profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_hr_role(auth.uid()) OR public.is_admin_role(auth.uid()))
  WITH CHECK (public.is_hr_role(auth.uid()) OR public.is_admin_role(auth.uid()));

-- When HR toggles hourly forms on/off, immediately refresh today's task instances for that setter.
CREATE OR REPLACE FUNCTION public.refresh_hourly_tasks_for_setter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.hourly_form_enabled IS DISTINCT FROM OLD.hourly_form_enabled THEN
    PERFORM public.materialize_task_instances(CURRENT_DATE);

    IF NEW.hourly_form_enabled = false AND NEW.status IS DISTINCT FROM 'pip' THEN
      DELETE FROM public.task_instances ti
      WHERE ti.assigned_to_user_id = NEW.user_id
        AND ti.due_date >= CURRENT_DATE
        AND ti.status = 'open'
        AND ti.link_type LIKE 'form_hourly_%';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_hourly_tasks_for_setter ON public.setters_profiles;
CREATE TRIGGER trg_refresh_hourly_tasks_for_setter
AFTER UPDATE OF hourly_form_enabled ON public.setters_profiles
FOR EACH ROW
EXECUTE FUNCTION public.refresh_hourly_tasks_for_setter();

-- Schedule birthday notifications daily at 09:15 UK time.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-birthday-notifications');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'daily-birthday-notifications',
  '15 9 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/daily-birthday-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);