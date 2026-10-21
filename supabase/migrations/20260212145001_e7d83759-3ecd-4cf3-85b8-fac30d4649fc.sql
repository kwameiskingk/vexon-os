
CREATE OR REPLACE FUNCTION public.notify_setter_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  status_message TEXT;
  v_role app_role;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.user_id IS NOT NULL THEN
    CASE NEW.status
      WHEN 'trainee' THEN
        status_message := 'Your status has been updated to Trainee. Check your coaching page for focus areas.';
      WHEN 'active' THEN
        status_message := 'Congratulations! Your status is now Active. Keep up the great work!';
      WHEN 'pip' THEN
        RETURN NEW;
      ELSE
        status_message := format('Your status has been updated to %s', NEW.status);
    END CASE;

    -- Look up the user's role
    SELECT role INTO v_role
    FROM public.user_roles
    WHERE user_id = NEW.user_id
    LIMIT 1;

    -- Default to 'setter' if no role found
    IF v_role IS NULL THEN
      v_role := 'setter';
    END IF;

    INSERT INTO public.notifications (
      recipient_id,
      recipient_role,
      title,
      message,
      category,
      link_url,
      triggered_by
    ) VALUES (
      NEW.user_id,
      v_role,
      'Status Updated',
      status_message,
      'system',
      '/setter/coaching',
      NEW.status_changed_by
    );
  END IF;

  RETURN NEW;
END;
$function$;
