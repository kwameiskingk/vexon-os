-- Fix the trigger to use valid notification_category enum value
CREATE OR REPLACE FUNCTION public.notify_post_discovery_feedback_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ae_name TEXT;
BEGIN
  -- Get AE name
  SELECT full_name INTO ae_name FROM public.profiles WHERE id = NEW.ae_user_id;
  
  -- Notify admins (using 'system' category since 'feedback' doesn't exist)
  INSERT INTO public.notifications (recipient_role, title, message, link_url, category)
  SELECT 
    ur.role,
    'Post Discovery Feedback Submitted',
    'Post Discovery feedback submitted by ' || COALESCE(ae_name, 'AE') || ' for ' || NEW.client_name || '.',
    '/admin/sales/ae-management',
    'system'
  FROM public.user_roles ur
  WHERE ur.role IN ('admin', 'dev', 'ops')
  GROUP BY ur.role;
  
  RETURN NEW;
END;
$function$;

-- Also fix the notify_post_discovery_feedback_reviewed function
CREATE OR REPLACE FUNCTION public.notify_post_discovery_feedback_reviewed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only trigger when status changes to 'reviewed'
  IF OLD.status = 'submitted' AND NEW.status = 'reviewed' THEN
    INSERT INTO public.notifications (recipient_id, title, message, link_url, category)
    VALUES (
      NEW.ae_user_id,
      'Feedback Reviewed',
      'Your Post Discovery feedback for ' || NEW.client_name || ' has been reviewed.',
      '/ae/post-discovery',
      'system'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;