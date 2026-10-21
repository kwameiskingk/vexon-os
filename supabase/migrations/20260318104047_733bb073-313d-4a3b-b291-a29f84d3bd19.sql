
-- Update the trigger function with new commission tiers:
-- Trainee SDR: $25, SDR: $50, Lead SDR: $75, Senior SDR: $100
CREATE OR REPLACE FUNCTION public.notify_setter_title_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_label TEXT;
  v_new_label TEXT;
  v_manager_ids UUID[];
BEGIN
  IF OLD.title IS DISTINCT FROM NEW.title AND NEW.user_id IS NOT NULL THEN
    v_old_label := CASE OLD.title
      WHEN 'trainee_sdr' THEN 'Trainee SDR'
      WHEN 'sdr' THEN 'SDR'
      WHEN 'lead_sdr' THEN 'Lead SDR'
      WHEN 'senior_sdr' THEN 'Senior SDR'
      ELSE COALESCE(OLD.title, 'Unknown')
    END;

    v_new_label := CASE NEW.title
      WHEN 'trainee_sdr' THEN 'Trainee SDR'
      WHEN 'sdr' THEN 'SDR'
      WHEN 'lead_sdr' THEN 'Lead SDR'
      WHEN 'senior_sdr' THEN 'Senior SDR'
      ELSE COALESCE(NEW.title, 'Unknown')
    END;

    -- Auto-set per_meeting_bonus based on new title
    CASE NEW.title
      WHEN 'senior_sdr' THEN NEW.per_meeting_bonus := 100;
      WHEN 'lead_sdr' THEN NEW.per_meeting_bonus := 75;
      WHEN 'sdr' THEN NEW.per_meeting_bonus := 50;
      WHEN 'trainee_sdr' THEN NEW.per_meeting_bonus := 25;
      ELSE NULL;
    END CASE;

    -- Notify the setter
    INSERT INTO notifications (recipient_id, recipient_role, title, message, category, link_url)
    VALUES (
      NEW.user_id,
      'setter',
      CASE WHEN ARRAY_POSITION(ARRAY['trainee_sdr','sdr','lead_sdr','senior_sdr'], NEW.title) >
                ARRAY_POSITION(ARRAY['trainee_sdr','sdr','lead_sdr','senior_sdr'], OLD.title)
           THEN '🎉 Promotion!'
           ELSE '📋 Title Update'
      END,
      'Your title has been changed from ' || v_old_label || ' to ' || v_new_label || '. Your per-meeting bonus is now $' || NEW.per_meeting_bonus || '.',
      'system',
      '/setter/coaching'
    );

    -- Notify managers
    SELECT ARRAY_AGG(manager_user_id) INTO v_manager_ids
    FROM sdr_manager_assignments
    WHERE setter_profile_id = NEW.id;

    IF v_manager_ids IS NOT NULL THEN
      INSERT INTO notifications (recipient_id, recipient_role, title, message, category, link_url)
      SELECT
        unnest(v_manager_ids),
        'sdr_manager',
        'Setter Title Changed',
        COALESCE(NEW.full_name, NEW.email) || ' changed from ' || v_old_label || ' to ' || v_new_label,
        'system',
        '/sdr-manager/setters'
      ;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Update default column value from 25 to 50
ALTER TABLE public.setters_profiles ALTER COLUMN per_meeting_bonus SET DEFAULT 50.00;

-- Update existing SDR-tier setters from $25 to $50
UPDATE public.setters_profiles SET per_meeting_bonus = 50 WHERE (title = 'sdr' OR title IS NULL) AND (per_meeting_bonus = 25 OR per_meeting_bonus IS NULL);
