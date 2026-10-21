-- Drop the existing check constraint on meetings.status
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_status_check;

-- Add updated check constraint with all workflow states
ALTER TABLE public.meetings ADD CONSTRAINT meetings_status_check 
CHECK (status IN (
  'pending',
  'pending_admin_approval',
  'admin_approved',
  'approved',
  'admin_rejected',
  'rejected',
  'client_pending_response',
  'client_accepted',
  'client_rejected'
));