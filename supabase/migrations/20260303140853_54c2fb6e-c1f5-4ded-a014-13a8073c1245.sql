
-- Add title/tier column to setters_profiles
ALTER TABLE public.setters_profiles 
ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'sdr'
CHECK (title IN ('trainee_sdr', 'sdr', 'lead_sdr'));

-- Update any setters currently with status='trainee' to have title='trainee_sdr'
UPDATE public.setters_profiles SET title = 'trainee_sdr' WHERE status = 'trainee';

-- Create notification trigger for title changes
CREATE OR REPLACE FUNCTION public.notify_setter_title_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      ELSE old_label := OLD.title;
    END CASE;
    
    CASE NEW.title
      WHEN 'trainee_sdr' THEN new_label := 'Trainee SDR';
      WHEN 'sdr' THEN new_label := 'SDR';
      WHEN 'lead_sdr' THEN new_label := 'Lead SDR';
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
        WHEN (NEW.title = 'sdr' AND OLD.title = 'trainee_sdr') OR (NEW.title = 'lead_sdr') 
        THEN '🎉 Promoted to ' || new_label || '!'
        ELSE '📋 Title Updated to ' || new_label
      END,
      CASE 
        WHEN (NEW.title = 'sdr' AND OLD.title = 'trainee_sdr') OR (NEW.title = 'lead_sdr')
        THEN 'Congratulations! You have been promoted from ' || old_label || ' to ' || new_label || '.'
        ELSE 'Your title has been updated from ' || old_label || ' to ' || new_label || '.'
      END,
      'system',
      '/setter'
    );

    -- Auto-update per_meeting_bonus for Lead SDR
    IF NEW.title = 'lead_sdr' THEN
      NEW.per_meeting_bonus := 75;
    ELSIF NEW.title = 'sdr' AND OLD.title = 'lead_sdr' THEN
      NEW.per_meeting_bonus := 25;
    ELSIF NEW.title = 'trainee_sdr' THEN
      NEW.per_meeting_bonus := 25;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_setter_title_change
BEFORE UPDATE ON public.setters_profiles
FOR EACH ROW
EXECUTE FUNCTION public.notify_setter_title_change();
