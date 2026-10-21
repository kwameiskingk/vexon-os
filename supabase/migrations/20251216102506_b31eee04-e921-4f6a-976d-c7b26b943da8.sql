-- 1. Fix meeting status check constraint to allow cancelled/rescheduled
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_status_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_status_check CHECK (
  status = ANY (ARRAY[
    'pending', 'pending_admin_approval', 'admin_approved', 'approved', 
    'admin_rejected', 'rejected', 'client_pending_response', 
    'client_accepted', 'client_rejected', 'cancelled', 'rescheduled',
    'sat', 'no_show'
  ])
);

-- 2. Drop the problematic auto client role assignment trigger
DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;

-- 3. Drop the function too since it's no longer needed
DROP FUNCTION IF EXISTS assign_default_role();