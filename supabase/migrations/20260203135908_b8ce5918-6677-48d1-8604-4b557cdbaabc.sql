-- Auto-assign new setters to SDR managers in their department
CREATE OR REPLACE FUNCTION auto_assign_setter_to_managers()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new setter profiles
DROP TRIGGER IF EXISTS trigger_auto_assign_setter ON setters_profiles;
CREATE TRIGGER trigger_auto_assign_setter
  AFTER INSERT ON setters_profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_setter_to_managers();

-- Backfill: Assign existing unassigned setters to managers in their department
INSERT INTO sdr_manager_assignments (manager_user_id, setter_profile_id, department)
SELECT DISTINCT 
  ur.user_id as manager_user_id,
  sp.id as setter_profile_id,
  sp.department
FROM setters_profiles sp
CROSS JOIN user_roles ur
INNER JOIN user_department_access uda ON uda.user_id = ur.user_id
WHERE ur.role = 'sdr_manager'
AND sp.active = true
AND (
  (sp.department = 'fulfilment' AND uda.department = 'operations')
  OR (sp.department = 'acquisition' AND uda.department = 'sales')
  OR uda.department = sp.department
)
AND NOT EXISTS (
  SELECT 1 FROM sdr_manager_assignments sma 
  WHERE sma.setter_profile_id = sp.id 
  AND sma.manager_user_id = ur.user_id
)
ON CONFLICT DO NOTHING;