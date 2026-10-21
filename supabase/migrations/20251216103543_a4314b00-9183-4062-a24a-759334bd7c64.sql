
-- 1. Fix meetings RLS policy to check client_profile_users join table
DROP POLICY IF EXISTS "Clients can view their assigned meetings" ON public.meetings;
CREATE POLICY "Clients can view their assigned meetings" 
ON public.meetings 
FOR SELECT 
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND approved_by_admin = true 
  AND (
    -- Check direct user_id on client_profiles (backwards compatibility)
    client_profile_id IN (
      SELECT id FROM client_profiles WHERE user_id = auth.uid()
    )
    OR
    -- Check client_profile_users join table (new flow)
    client_profile_id IN (
      SELECT client_profile_id FROM client_profile_users WHERE user_id = auth.uid()
    )
  )
);

-- 2. Fix client update policy similarly
DROP POLICY IF EXISTS "Clients can update their assigned meetings" ON public.meetings;
CREATE POLICY "Clients can update their assigned meetings" 
ON public.meetings 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND approved_by_admin = true 
  AND (
    client_profile_id IN (
      SELECT id FROM client_profiles WHERE user_id = auth.uid()
    )
    OR
    client_profile_id IN (
      SELECT client_profile_id FROM client_profile_users WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role) 
  AND approved_by_admin = true
);

-- 3. Fix notification trigger to only notify clients AFTER admin approval (on UPDATE)
CREATE OR REPLACE FUNCTION public.notify_meeting_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Only notify when meeting is first approved by admin
  IF OLD.approved_by_admin = false AND NEW.approved_by_admin = true AND NEW.client_profile_id IS NOT NULL THEN
    -- Notify via client_profile_users (new flow)
    INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
    SELECT 
      'client',
      cpu.user_id,
      'New Meeting Available',
      'A new meeting has been approved and is ready for your review.',
      'meeting',
      '/client/meetings',
      NEW.setter_id
    FROM client_profile_users cpu
    WHERE cpu.client_profile_id = NEW.client_profile_id;
    
    -- Also notify via direct user_id (backwards compatibility)
    INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
    SELECT 
      'client',
      cp.user_id,
      'New Meeting Available',
      'A new meeting has been approved and is ready for your review.',
      'meeting',
      '/client/meetings',
      NEW.setter_id
    FROM client_profiles cp
    WHERE cp.id = NEW.client_profile_id AND cp.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM client_profile_users cpu 
      WHERE cpu.client_profile_id = NEW.client_profile_id AND cpu.user_id = cp.user_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for approval notification
DROP TRIGGER IF EXISTS on_meeting_approved ON public.meetings;
CREATE TRIGGER on_meeting_approved
  AFTER UPDATE ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_meeting_approved();

-- 4. Update notify_meeting_created to NOT notify clients immediately (only notify admins)
CREATE OR REPLACE FUNCTION public.notify_meeting_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Only notify admin when meeting is created (client notification happens on approval)
  INSERT INTO public.notifications (recipient_role, title, message, category, link_url, triggered_by)
  VALUES (
    'admin',
    'New Meeting Awaiting Approval',
    'Meeting logged by ' || COALESCE((SELECT full_name FROM setters_profiles WHERE user_id = NEW.setter_id), 'setter') || ' awaiting approval.',
    'meeting',
    '/admin/meetings',
    NEW.setter_id
  );
  
  RETURN NEW;
END;
$$;
