
CREATE OR REPLACE FUNCTION public.notify_post_discovery_feedback_reviewed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'submitted' AND NEW.status = 'reviewed' THEN
    INSERT INTO public.notifications (recipient_id, recipient_role, title, message, link_url, category)
    VALUES (
      NEW.ae_user_id,
      'account_executive',
      'Feedback Reviewed',
      'Your Post Discovery feedback for ' || NEW.client_name || ' has been reviewed.',
      '/ae/post-discovery',
      'system'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
