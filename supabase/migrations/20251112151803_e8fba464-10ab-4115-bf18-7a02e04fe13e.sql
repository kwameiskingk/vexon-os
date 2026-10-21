-- Add recipient_role column to admin_messages
ALTER TABLE public.admin_messages 
ADD COLUMN IF NOT EXISTS recipient_role app_role;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can view their messages" ON public.admin_messages;
DROP POLICY IF EXISTS "Admins can send messages" ON public.admin_messages;
DROP POLICY IF EXISTS "Admins can mark messages as read" ON public.admin_messages;

-- New SELECT policy: Admins see ALL, Setters see their own + broadcasts to setters
CREATE POLICY "Users can view relevant messages"
ON public.admin_messages
FOR SELECT
USING (
  CASE
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN true
    WHEN has_role(auth.uid(), 'setter'::app_role) THEN (
      sender_id = auth.uid() OR 
      recipient_id = auth.uid() OR 
      recipient_role = 'setter'::app_role
    )
    ELSE false
  END
);

-- New INSERT policy: Admins can send to anyone, Setters can only send to admins
CREATE POLICY "Users can send messages"
ON public.admin_messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND
  CASE
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN true
    WHEN has_role(auth.uid(), 'setter'::app_role) THEN (
      (recipient_id IS NOT NULL AND recipient_role IS NULL AND EXISTS (
        SELECT 1 FROM user_roles WHERE user_id = recipient_id AND role = 'admin'::app_role
      )) OR
      (recipient_id IS NULL AND recipient_role = 'admin'::app_role)
    )
    ELSE false
  END
);

-- UPDATE policy: Users can mark messages as read
CREATE POLICY "Users can mark messages as read"
ON public.admin_messages
FOR UPDATE
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'setter'::app_role)) AND
  (recipient_id = auth.uid() OR (recipient_id IS NULL AND EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = recipient_role::app_role
  )))
);