-- Create function to notify rival when chosen
CREATE OR REPLACE FUNCTION public.notify_rival_chosen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rival_name text;
  setter_name text;
BEGIN
  -- Only notify if rival_email changed and is not null
  IF NEW.rival_email IS NOT NULL AND (OLD.rival_email IS DISTINCT FROM NEW.rival_email) THEN
    -- Get the rival's name
    SELECT full_name INTO rival_name
    FROM setters_profiles
    WHERE email = NEW.rival_email;
    
    setter_name := COALESCE(NEW.full_name, NEW.email);
    
    -- Send notification to the rival
    INSERT INTO notifications (
      recipient_role,
      recipient_id,
      title,
      message,
      category,
      triggered_by,
      link_url
    )
    SELECT
      'setter',
      sp.user_id,
      'You Have a New Rival!',
      setter_name || ' has chosen you as their rival. Check the leaderboard to see the competition!',
      'system',
      NEW.user_id,
      '/setter'
    FROM setters_profiles sp
    WHERE sp.email = NEW.rival_email;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on setters_profiles for rivalry notifications
DROP TRIGGER IF EXISTS on_rivalry_set ON setters_profiles;
CREATE TRIGGER on_rivalry_set
  AFTER UPDATE ON setters_profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_rival_chosen();