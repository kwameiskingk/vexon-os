-- Add new columns to meetings table for enhanced workflow
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS client_has_account boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verbal_acceptance boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_rebook boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS original_meeting_id uuid REFERENCES meetings(id);

-- Update RLS policies to allow clients to see meetings assigned to their profile
-- even if account was created after assignment
DROP POLICY IF EXISTS "Clients can view their assigned meetings" ON meetings;

CREATE POLICY "Clients can view their assigned meetings"
ON meetings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND approved_by_admin = true 
  AND (
    client_profile_id IN (
      SELECT id FROM client_profiles WHERE user_id = auth.uid()
    )
  )
);