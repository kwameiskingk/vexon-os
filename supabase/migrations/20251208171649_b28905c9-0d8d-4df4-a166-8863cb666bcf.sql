-- Drop existing restrictive policies on admin_messages
DROP POLICY IF EXISTS "Users can send messages" ON admin_messages;
DROP POLICY IF EXISTS "Users can view relevant messages" ON admin_messages;
DROP POLICY IF EXISTS "Users can mark messages as read" ON admin_messages;

-- Create new policies that allow all team members to message each other

-- Policy: All team members can send messages to anyone
CREATE POLICY "Team members can send messages"
ON admin_messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND
  is_admin_role(auth.uid())
);

-- Policy: Team members can view messages they sent or received
CREATE POLICY "Team members can view messages"
ON admin_messages
FOR SELECT
USING (
  is_admin_role(auth.uid()) AND (
    sender_id = auth.uid() OR
    recipient_id = auth.uid() OR
    (recipient_id IS NULL AND recipient_role IN ('admin', 'setter'))
  )
);

-- Policy: Team members can mark messages as read (their own received messages)
CREATE POLICY "Team members can mark messages as read"
ON admin_messages
FOR UPDATE
USING (
  is_admin_role(auth.uid()) AND (
    recipient_id = auth.uid() OR
    (recipient_id IS NULL AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = admin_messages.recipient_role
    ))
  )
);