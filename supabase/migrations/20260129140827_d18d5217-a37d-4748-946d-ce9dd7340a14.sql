
-- Create a trigger function to notify setters when placed on PIP
CREATE OR REPLACE FUNCTION notify_setter_on_pip()
RETURNS TRIGGER AS $$
DECLARE
  setter_user_id UUID;
  setter_name TEXT;
BEGIN
  -- Only notify on new PIP records with 'active' status
  IF NEW.status = 'active' THEN
    -- Get the setter's user_id from setters_profiles
    SELECT user_id, full_name INTO setter_user_id, setter_name
    FROM setters_profiles
    WHERE id = NEW.setter_profile_id;
    
    -- Create a notification for the setter
    IF setter_user_id IS NOT NULL THEN
      INSERT INTO notifications (
        recipient_id,
        title,
        message,
        type,
        priority,
        is_read
      ) VALUES (
        setter_user_id,
        'Performance Improvement Plan',
        'You have been placed on a Performance Improvement Plan. Please check your Coaching tab for details and action items.',
        'warning',
        'high',
        false
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger on pip_records
DROP TRIGGER IF EXISTS trigger_notify_setter_pip ON pip_records;
CREATE TRIGGER trigger_notify_setter_pip
  AFTER INSERT ON pip_records
  FOR EACH ROW
  EXECUTE FUNCTION notify_setter_on_pip();

-- Also create a trigger for when PIP is completed/failed to notify setter
CREATE OR REPLACE FUNCTION notify_setter_pip_status_change()
RETURNS TRIGGER AS $$
DECLARE
  setter_user_id UUID;
  notification_message TEXT;
  notification_type TEXT;
BEGIN
  -- Only notify if status changed from 'active' to something else
  IF OLD.status = 'active' AND NEW.status != 'active' THEN
    -- Get the setter's user_id
    SELECT user_id INTO setter_user_id
    FROM setters_profiles
    WHERE id = NEW.setter_profile_id;
    
    IF setter_user_id IS NOT NULL THEN
      -- Set message based on outcome
      IF NEW.status = 'completed' THEN
        notification_message := 'Congratulations! You have successfully completed your Performance Improvement Plan.';
        notification_type := 'success';
      ELSIF NEW.status = 'extended' THEN
        notification_message := 'Your Performance Improvement Plan has been extended. Please check your Coaching tab for updated details.';
        notification_type := 'warning';
      ELSE
        notification_message := 'Your Performance Improvement Plan status has been updated. Please check your Coaching tab for details.';
        notification_type := 'info';
      END IF;
      
      INSERT INTO notifications (
        recipient_id,
        title,
        message,
        type,
        priority,
        is_read
      ) VALUES (
        setter_user_id,
        'PIP Status Update',
        notification_message,
        notification_type,
        'high',
        false
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger for status changes
DROP TRIGGER IF EXISTS trigger_notify_setter_pip_status ON pip_records;
CREATE TRIGGER trigger_notify_setter_pip_status
  AFTER UPDATE ON pip_records
  FOR EACH ROW
  EXECUTE FUNCTION notify_setter_pip_status_change();
