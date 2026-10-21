
-- Step 1: Remove the auto-mark-sat cron job (job 12)
SELECT cron.unschedule(12);

-- Step 2: Reset incorrectly marked acquisition meetings back to pending
-- These are meetings marked as 'sat' but have no discovery log entry
UPDATE meetings m
SET 
  attendance_status = 'pending',
  attendance_confirmed = false,
  updated_at = now()
WHERE m.department = 'acquisition'
  AND m.attendance_status = 'sat'
  AND NOT EXISTS (
    SELECT 1 FROM sales_discovery_logs dl WHERE dl.meeting_id = m.id
  );
