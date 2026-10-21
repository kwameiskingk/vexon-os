-- Fix PIP notification triggers: notification_category enum does NOT include 'warning/success/info'
-- Allowed values: meeting, warm_lead, kpi, resource, system, achievement

CREATE OR REPLACE FUNCTION public.notify_setter_on_pip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  setter_user_id uuid;
BEGIN
  SELECT user_id
    INTO setter_user_id
  FROM public.setters_profiles
  WHERE id = NEW.setter_profile_id;

  IF setter_user_id IS NOT NULL AND NEW.status = 'active' THEN
    INSERT INTO public.notifications (
      recipient_id,
      recipient_role,
      title,
      message,
      category,
      link_url
    ) VALUES (
      setter_user_id,
      'setter'::public.app_role,
      'Performance Improvement Plan',
      'You have been placed on a Performance Improvement Plan. Check the Coaching tab for your action items.',
      'system'::public.notification_category,
      '/setter/coaching'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_setter_pip_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  setter_user_id uuid;
  notification_title text;
  notification_message text;
BEGIN
  IF OLD.status = 'active' AND NEW.status != 'active' THEN
    SELECT user_id
      INTO setter_user_id
    FROM public.setters_profiles
    WHERE id = NEW.setter_profile_id;

    IF setter_user_id IS NOT NULL THEN
      IF NEW.status = 'completed' THEN
        notification_title := 'PIP Completed';
        notification_message := 'Your PIP has been marked completed.';
      ELSIF NEW.status = 'extended' THEN
        notification_title := 'PIP Extended';
        notification_message := 'Your PIP has been extended. Check Coaching for updated expectations.';
      ELSIF NEW.status = 'failed' THEN
        notification_title := 'PIP Closed';
        notification_message := 'Your PIP has been closed. Check Coaching for details.';
      ELSE
        notification_title := 'PIP Status Updated';
        notification_message := 'Your PIP status is now: ' || NEW.status;
      END IF;

      INSERT INTO public.notifications (
        recipient_id,
        recipient_role,
        title,
        message,
        category,
        link_url
      ) VALUES (
        setter_user_id,
        'setter'::public.app_role,
        notification_title,
        notification_message,
        'system'::public.notification_category,
        '/setter/coaching'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure triggers exist (idempotent)
DROP TRIGGER IF EXISTS trigger_notify_setter_pip ON public.pip_records;
CREATE TRIGGER trigger_notify_setter_pip
AFTER INSERT ON public.pip_records
FOR EACH ROW
EXECUTE FUNCTION public.notify_setter_on_pip();

DROP TRIGGER IF EXISTS trigger_notify_setter_pip_status ON public.pip_records;
CREATE TRIGGER trigger_notify_setter_pip_status
AFTER UPDATE ON public.pip_records
FOR EACH ROW
EXECUTE FUNCTION public.notify_setter_pip_status_change();