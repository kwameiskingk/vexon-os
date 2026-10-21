
-- Add RLS policy for SDR managers to view performance data for their assigned setters
CREATE POLICY "SDR managers can view assigned setter performance"
ON performance FOR SELECT
TO public
USING (
  has_role(auth.uid(), 'sdr_manager'::app_role)
  AND setter_id IN (
    SELECT sp.user_id 
    FROM sdr_manager_assignments sma
    JOIN setters_profiles sp ON sp.id = sma.setter_profile_id
    WHERE sma.manager_user_id = auth.uid()
  )
);
