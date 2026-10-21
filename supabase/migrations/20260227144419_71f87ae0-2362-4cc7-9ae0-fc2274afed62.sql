CREATE OR REPLACE FUNCTION public.notify_setter_on_coaching_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  setter_user_id UUID;
  old_action_count INT;
  new_action_count INT;
BEGIN
  -- Only notify if action_items increased
  old_action_count := COALESCE(array_length(OLD.action_items, 1), 0);
  new_action_count := COALESCE(array_length(NEW.action_items, 1), 0);

  IF new_action_count > old_action_count THEN
    SELECT user_id INTO setter_user_id
    FROM public.setters_profiles
    WHERE id = NEW.setter_profile_id;

    IF setter_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_id,
        recipient_role,
        title,
        message,
        category,
        link_url,
        triggered_by
      ) VALUES (
        setter_user_id,
        'setter',
        'Coaching Action Items Updated',
        format('Your manager added %s new action item(s) to your coaching session', new_action_count - old_action_count),
        'system',
        '/setter/coaching',
        NEW.manager_user_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;