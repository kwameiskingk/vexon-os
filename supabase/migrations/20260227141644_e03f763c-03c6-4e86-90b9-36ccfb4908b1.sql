
CREATE OR REPLACE FUNCTION public.notify_setter_on_coaching_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  setter_user_id UUID;
  setter_name TEXT;
  manager_name TEXT;
  action_count INT;
BEGIN
  SELECT user_id, full_name INTO setter_user_id, setter_name
  FROM public.setters_profiles
  WHERE id = NEW.setter_profile_id;

  SELECT full_name INTO manager_name
  FROM public.profiles
  WHERE id = NEW.manager_user_id;

  action_count := COALESCE(array_length(NEW.action_items, 1), 0);

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
$function$;
