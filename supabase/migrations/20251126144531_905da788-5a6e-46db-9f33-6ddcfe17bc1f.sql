-- Drop the foreign key constraint that limits meeting_logs to only setters
ALTER TABLE meeting_logs 
DROP CONSTRAINT IF EXISTS meeting_logs_setter_id_fkey;

-- Add a comment explaining the setter_id now refers to any user
COMMENT ON COLUMN meeting_logs.setter_id IS 'User ID from profiles table - can be admin, setter, or any other user type';