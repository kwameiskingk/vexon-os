-- Create admin_messages table for internal team communication
CREATE TABLE IF NOT EXISTS public.admin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  recipient_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

-- Admins can view all messages they sent or received
CREATE POLICY "Admins can view their messages"
  ON public.admin_messages
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) AND 
    (sender_id = auth.uid() OR recipient_id = auth.uid() OR recipient_id IS NULL)
  );

-- Admins can send messages
CREATE POLICY "Admins can send messages"
  ON public.admin_messages
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) AND 
    sender_id = auth.uid()
  );

-- Admins can mark their received messages as read
CREATE POLICY "Admins can mark messages as read"
  ON public.admin_messages
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) AND 
    (recipient_id = auth.uid() OR recipient_id IS NULL)
  );

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_messages;

-- Create index for performance
CREATE INDEX idx_admin_messages_recipient ON public.admin_messages(recipient_id);
CREATE INDEX idx_admin_messages_sender ON public.admin_messages(sender_id);
CREATE INDEX idx_admin_messages_created_at ON public.admin_messages(created_at DESC);