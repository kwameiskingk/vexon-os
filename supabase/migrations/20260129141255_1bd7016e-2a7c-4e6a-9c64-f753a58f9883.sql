-- Drop the broken triggers and functions
DROP TRIGGER IF EXISTS trigger_notify_setter_pip ON pip_records;
DROP TRIGGER IF EXISTS trigger_notify_setter_pip_status ON pip_records;
DROP FUNCTION IF EXISTS notify_setter_on_pip();
DROP FUNCTION IF EXISTS notify_setter_pip_status_change();

-- Recreate with correct column names (using 'category' not 'type')
CREATE OR REPLACE FUNCTION notify_setter_on_pip()
RETURNS TRIGGER AS $$
DECLARE
  setter_user_id uuid;
BEGIN
  -- Get the user_id from setters_profiles
  SELECT user_id INTO setter_user_id
  FROM setters_profiles
  WHERE id = NEW.setter_profile_id;

  -- Only notify if we found a user_id and PIP is active
  IF setter_user_id IS NOT NULL AND NEW.status = 'active' THEN
    INSERT INTO notifications (
      recipient_id,
      recipient_role,
      title,
      message,
      category,
      link_url
    ) VALUES (
      setter_user_id,
      'setter'::app_role,
      'Performance Improvement Plan',
      'You have been placed on a Performance Improvement Plan. Please review the details and speak with your manager.',
      'warning'::notification_category,
      '/setter/coaching'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for new PIP creation
CREATE TRIGGER trigger_notify_setter_pip
AFTER INSERT ON pip_records
FOR EACH ROW
EXECUTE FUNCTION notify_setter_on_pip();

-- Function to notify on PIP status changes
CREATE OR REPLACE FUNCTION notify_setter_pip_status_change()
RETURNS TRIGGER AS $$
DECLARE
  setter_user_id uuid;
  notification_title text;
  notification_message text;
  notification_category notification_category;
BEGIN
  -- Only trigger if status changed and was previously active
  IF OLD.status = 'active' AND NEW.status != 'active' THEN
    -- Get the user_id from setters_profiles
    SELECT user_id INTO setter_user_id
    FROM setters_profiles
    WHERE id = NEW.setter_profile_id;

    IF setter_user_id IS NOT NULL THEN
      -- Set message based on new status
      IF NEW.status = 'completed' THEN
        notification_title := 'PIP Completed Successfully';
        notification_message := 'Congratulations! You have successfully completed your Performance Improvement Plan.';
        notification_category := 'success'::notification_category;
      ELSIF NEW.status = 'extended' THEN
        notification_title := 'PIP Extended';
        notification_message := 'Your Performance Improvement Plan has been extended. Please continue working on your targets.';
        notification_category := 'warning'::notification_category;
      ELSE
        notification_title := 'PIP Status Update';
        notification_message := 'Your Performance Improvement Plan status has been updated to: ' || NEW.status;
        notification_category := 'info'::notification_category;
      END IF;

      INSERT INTO notifications (
        recipient_id,
        recipient_role,
        title,
        message,
        category,
        link_url
      ) VALUES (
        setter_user_id,
        'setter'::app_role,
        notification_title,
        notification_message,
        notification_category,
        '/setter/coaching'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for PIP status changes
CREATE TRIGGER trigger_notify_setter_pip_status
AFTER UPDATE ON pip_records
FOR EACH ROW
EXECUTE FUNCTION notify_setter_pip_status_change();