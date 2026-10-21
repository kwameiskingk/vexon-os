-- Drop and recreate the insert policy to include setters
DROP POLICY IF EXISTS "Team members can send messages" ON admin_messages;

-- Create policy that allows all team members (including setters) to send messages
CREATE POLICY "Team members can send messages"
ON admin_messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND
  (is_admin_role(auth.uid()) OR has_role(auth.uid(), 'setter'))
);

-- Also update the view policy to include setters
DROP POLICY IF EXISTS "Team members can view messages" ON admin_messages;

CREATE POLICY "Team members can view messages"
ON admin_messages
FOR SELECT
USING (
  (is_admin_role(auth.uid()) OR has_role(auth.uid(), 'setter')) AND (
    sender_id = auth.uid() OR
    recipient_id = auth.uid() OR
    (recipient_id IS NULL AND recipient_role IN ('admin', 'setter'))
  )
);

-- Update mark as read policy to include setters
DROP POLICY IF EXISTS "Team members can mark messages as read" ON admin_messages;

CREATE POLICY "Team members can mark messages as read"
ON admin_messages
FOR UPDATE
USING (
  (is_admin_role(auth.uid()) OR has_role(auth.uid(), 'setter')) AND (
    recipient_id = auth.uid() OR
    (recipient_id IS NULL AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = admin_messages.recipient_role
    ))
  )
);