-- Function to notify setter when coaching session is created
CREATE OR REPLACE FUNCTION public.notify_setter_on_coaching_session()
RETURNS TRIGGER AS $$
DECLARE
  setter_user_id UUID;
  setter_name TEXT;
  manager_name TEXT;
  action_count INT;
BEGIN
  -- Get setter's user_id from setters_profiles
  SELECT user_id, full_name INTO setter_user_id, setter_name
  FROM public.setters_profiles
  WHERE id = NEW.setter_profile_id;

  -- Get manager name
  SELECT full_name INTO manager_name
  FROM public.profiles
  WHERE id = NEW.manager_user_id;

  -- Count action items
  action_count := COALESCE(array_length(NEW.action_items, 1), 0);

  -- Only notify if setter has user_id
  IF setter_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id,
      title,
      message,
      category,
      link_url,
      triggered_by
    ) VALUES (
      setter_user_id,
      'New Coaching Session Logged',
      CASE 
        WHEN action_count > 0 THEN 
          format('%s logged a %s session with %s action items for you', 
            COALESCE(manager_name, 'Your manager'),
            REPLACE(NEW.session_type, '_', ' '),
            action_count)
        ELSE
          format('%s logged a %s session for you',
            COALESCE(manager_name, 'Your manager'),
            REPLACE(NEW.session_type, '_', ' '))
      END,
      'system',
      '/setter/coaching',
      NEW.manager_user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for new coaching sessions
DROP TRIGGER IF EXISTS trigger_notify_coaching_session ON public.coaching_sessions;
CREATE TRIGGER trigger_notify_coaching_session
  AFTER INSERT ON public.coaching_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_setter_on_coaching_session();

-- Function for coaching session updates (new action items)
CREATE OR REPLACE FUNCTION public.notify_setter_on_coaching_update()
RETURNS TRIGGER AS $$
DECLARE
  setter_user_id UUID;
  old_action_count INT;
  new_action_count INT;
BEGIN
  -- Only notify if action_items changed
  old_action_count := COALESCE(array_length(OLD.action_items, 1), 0);
  new_action_count := COALESCE(array_length(NEW.action_items, 1), 0);

  IF new_action_count > old_action_count THEN
    SELECT user_id INTO setter_user_id
    FROM public.setters_profiles
    WHERE id = NEW.setter_profile_id;

    IF setter_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_id,
        title,
        message,
        category,
        link_url
      ) VALUES (
        setter_user_id,
        'Coaching Action Items Updated',
        format('Your manager added %s new action item(s) to your coaching session', 
          new_action_count - old_action_count),
        'system',
        '/setter/coaching'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for coaching session updates
DROP TRIGGER IF EXISTS trigger_notify_coaching_update ON public.coaching_sessions;
CREATE TRIGGER trigger_notify_coaching_update
  AFTER UPDATE ON public.coaching_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_setter_on_coaching_update();

-- Function to notify setter when status changes
CREATE OR REPLACE FUNCTION public.notify_setter_status_change()
RETURNS TRIGGER AS $$
DECLARE
  status_message TEXT;
BEGIN
  -- Only trigger if status actually changed and setter has user_id
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.user_id IS NOT NULL THEN
    CASE NEW.status
      WHEN 'trainee' THEN
        status_message := 'Your status has been updated to Trainee. Check your coaching page for focus areas.';
      WHEN 'active' THEN
        status_message := 'Congratulations! Your status is now Active. Keep up the great work!';
      WHEN 'pip' THEN
        -- PIP has its own trigger, skip here
        RETURN NEW;
      ELSE
        status_message := format('Your status has been updated to %s', NEW.status);
    END CASE;

    INSERT INTO public.notifications (
      recipient_id,
      title,
      message,
      category,
      link_url,
      triggered_by
    ) VALUES (
      NEW.user_id,
      'Status Updated',
      status_message,
      'system',
      '/setter/coaching',
      NEW.status_changed_by
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for setter status changes
DROP TRIGGER IF EXISTS trigger_notify_setter_status_change ON public.setters_profiles;
CREATE TRIGGER trigger_notify_setter_status_change
  AFTER UPDATE ON public.setters_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_setter_status_change();