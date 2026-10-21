-- Fix search_path for the new function
CREATE OR REPLACE FUNCTION auto_assign_setter_to_managers()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  manager_record RECORD;
BEGIN
  -- Only process if this is a new setter profile with a department
  IF NEW.department IS NOT NULL AND NEW.active = true THEN
    -- Find all SDR managers who have access to this department
    FOR manager_record IN 
      SELECT DISTINCT ur.user_id as manager_user_id
      FROM user_roles ur
      INNER JOIN user_department_access uda ON uda.user_id = ur.user_id
      WHERE ur.role = 'sdr_manager'
      AND (
        (NEW.department = 'fulfilment' AND uda.department = 'operations')
        OR (NEW.department = 'acquisition' AND uda.department = 'sales')
        OR uda.department = NEW.department
      )
    LOOP
      -- Insert assignment if it doesn't already exist
      INSERT INTO sdr_manager_assignments (
        manager_user_id,
        setter_profile_id,
        department
      ) VALUES (
        manager_record.manager_user_id,
        NEW.id,
        NEW.department
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;