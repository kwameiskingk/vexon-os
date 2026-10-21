-- Create notification category enum
CREATE TYPE public.notification_category AS ENUM ('meeting', 'warm_lead', 'kpi', 'resource', 'system');

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_role app_role NOT NULL,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category notification_category NOT NULL,
  link_url TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (
  (recipient_id IS NULL AND has_role(auth.uid(), recipient_role)) 
  OR 
  (recipient_id = auth.uid())
);

CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (
  (recipient_id IS NULL AND has_role(auth.uid(), recipient_role)) 
  OR 
  (recipient_id = auth.uid())
);

CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Index for performance
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id, recipient_role, is_read, created_at DESC);

-- Function to create meeting notifications
CREATE OR REPLACE FUNCTION public.notify_meeting_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Notify admin
  INSERT INTO public.notifications (recipient_role, title, message, category, link_url, triggered_by)
  VALUES (
    'admin',
    'New Meeting Awaiting Approval',
    'Meeting logged by ' || COALESCE((SELECT full_name FROM setters_profiles WHERE user_id = NEW.setter_id), 'setter') || ' awaiting approval.',
    'meeting',
    '/admin/meetings',
    NEW.setter_id
  );
  
  -- Notify client if assigned
  IF NEW.client_profile_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
    SELECT 
      'client',
      cp.user_id,
      'New Meeting Available',
      'New meeting available to accept or reject.',
      'meeting',
      '/client/meetings',
      NEW.setter_id
    FROM client_profiles cp
    WHERE cp.id = NEW.client_profile_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to notify on meeting acceptance/rejection
CREATE OR REPLACE FUNCTION public.notify_meeting_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only notify if client_accepted status changed
  IF OLD.client_accepted IS DISTINCT FROM NEW.client_accepted THEN
    IF NEW.client_accepted = true THEN
      INSERT INTO public.notifications (recipient_role, title, message, category, link_url, triggered_by)
      VALUES (
        'admin',
        'Meeting Accepted',
        'Client ' || NEW.company_name || ' accepted meeting.',
        'meeting',
        '/admin/meetings',
        NEW.client_user_id
      );
    ELSIF NEW.client_accepted = false THEN
      INSERT INTO public.notifications (recipient_role, title, message, category, link_url, triggered_by)
      VALUES (
        'admin',
        'Meeting Rejected',
        'Client ' || NEW.company_name || ' rejected meeting.',
        'meeting',
        '/admin/meetings',
        NEW.client_user_id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to notify on warm lead creation
CREATE OR REPLACE FUNCTION public.notify_warm_lead_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Notify admin
  INSERT INTO public.notifications (recipient_role, title, message, category, link_url, triggered_by)
  SELECT
    'admin',
    'New Warm Lead Added',
    'Setter ' || COALESCE(sp.full_name, 'unknown') || ' added a new warm lead: ' || NEW.company_name,
    'warm_lead',
    '/admin/leads',
    NEW.setter_id
  FROM setters_profiles sp
  WHERE sp.user_id = NEW.setter_id;
  
  -- Notify the setter
  INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
  VALUES (
    'setter',
    NEW.setter_id,
    'New Warm Lead Assigned',
    'New warm lead assigned to you: ' || NEW.company_name,
    'warm_lead',
    '/setter/warm-leads',
    NEW.setter_id
  );
  
  RETURN NEW;
END;
$$;

-- Function to notify on resource creation
CREATE OR REPLACE FUNCTION public.notify_resource_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Notify admins
  INSERT INTO public.notifications (recipient_role, title, message, category, link_url)
  VALUES (
    'admin',
    'New Resource Published',
    'New resource published: ' || NEW.title,
    'resource',
    '/admin/resources'
  );
  
  -- If visible to clients, notify them
  IF NEW.visible_to_clients THEN
    INSERT INTO public.notifications (recipient_role, title, message, category, link_url)
    VALUES (
      'client',
      'New Resources Available',
      'New resources have been uploaded to your dashboard.',
      'resource',
      '/client/resources'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Triggers
CREATE TRIGGER on_meeting_created
  AFTER INSERT ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_meeting_created();

CREATE TRIGGER on_meeting_updated
  AFTER UPDATE ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_meeting_updated();

CREATE TRIGGER on_warm_lead_created
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_warm_lead_created();

CREATE TRIGGER on_resource_created
  AFTER INSERT ON public.resources
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_resource_created();