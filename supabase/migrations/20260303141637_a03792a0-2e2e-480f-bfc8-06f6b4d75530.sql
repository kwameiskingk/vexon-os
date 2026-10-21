
-- Update the notify_setter_title_change trigger to include senior_sdr
CREATE OR REPLACE FUNCTION public.notify_setter_title_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  old_label TEXT;
  new_label TEXT;
  v_role app_role;
BEGIN
  IF OLD.title IS DISTINCT FROM NEW.title AND NEW.user_id IS NOT NULL THEN
    -- Format labels
    CASE OLD.title
      WHEN 'trainee_sdr' THEN old_label := 'Trainee SDR';
      WHEN 'sdr' THEN old_label := 'SDR';
      WHEN 'lead_sdr' THEN old_label := 'Lead SDR';
      WHEN 'senior_sdr' THEN old_label := 'Senior SDR';
      ELSE old_label := OLD.title;
    END CASE;
    
    CASE NEW.title
      WHEN 'trainee_sdr' THEN new_label := 'Trainee SDR';
      WHEN 'sdr' THEN new_label := 'SDR';
      WHEN 'lead_sdr' THEN new_label := 'Lead SDR';
      WHEN 'senior_sdr' THEN new_label := 'Senior SDR';
      ELSE new_label := NEW.title;
    END CASE;

    SELECT role INTO v_role FROM public.user_roles WHERE user_id = NEW.user_id LIMIT 1;
    IF v_role IS NULL THEN v_role := 'setter'; END IF;

    -- Determine if promotion or demotion
    INSERT INTO public.notifications (
      recipient_id, recipient_role, title, message, category, link_url
    ) VALUES (
      NEW.user_id,
      v_role,
      CASE 
        WHEN (NEW.title = 'sdr' AND OLD.title = 'trainee_sdr') 
          OR (NEW.title = 'lead_sdr' AND OLD.title IN ('trainee_sdr', 'sdr'))
          OR (NEW.title = 'senior_sdr' AND OLD.title IN ('trainee_sdr', 'sdr', 'lead_sdr'))
        THEN '🎉 Promoted to ' || new_label || '!'
        ELSE '📋 Title Updated to ' || new_label
      END,
      CASE 
        WHEN (NEW.title = 'sdr' AND OLD.title = 'trainee_sdr') 
          OR (NEW.title = 'lead_sdr' AND OLD.title IN ('trainee_sdr', 'sdr'))
          OR (NEW.title = 'senior_sdr' AND OLD.title IN ('trainee_sdr', 'sdr', 'lead_sdr'))
        THEN 'Congratulations! You have been promoted from ' || old_label || ' to ' || new_label || '.'
        ELSE 'Your title has been updated from ' || old_label || ' to ' || new_label || '.'
      END,
      'system',
      '/setter'
    );

    -- Auto-update per_meeting_bonus based on tier
    CASE NEW.title
      WHEN 'senior_sdr' THEN NEW.per_meeting_bonus := 75;
      WHEN 'lead_sdr' THEN NEW.per_meeting_bonus := 50;
      WHEN 'sdr' THEN NEW.per_meeting_bonus := 25;
      WHEN 'trainee_sdr' THEN NEW.per_meeting_bonus := 25;
      ELSE NULL;
    END CASE;
  END IF;
  
  RETURN NEW;
END;
$function$;
