-- Fix the notify_post_discovery_feedback_submitted trigger to use correct column names
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
  
  -- Notify admins (using recipient_role, not user_id)
  INSERT INTO public.notifications (recipient_role, title, message, link_url, category)
  SELECT 
    ur.role,
    'Post Discovery Feedback Submitted',
    'Post Discovery feedback submitted by ' || COALESCE(ae_name, 'AE') || ' for ' || NEW.client_name || '.',
    '/admin/sales/ae-management',
    'feedback'
  FROM public.user_roles ur
  WHERE ur.role IN ('admin', 'dev', 'ops')
  GROUP BY ur.role;
  
  RETURN NEW;
END;
$function$;