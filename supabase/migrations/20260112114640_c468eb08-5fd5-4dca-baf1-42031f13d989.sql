-- ============================================================================
-- SETTER CLIENT ASSIGNMENTS TABLE
-- Tracks assignment of fulfillment setters to specific clients with meeting targets
-- ============================================================================

-- Create the setter_client_assignments table
CREATE TABLE public.setter_client_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_id UUID NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  meeting_target INTEGER NOT NULL DEFAULT 3,
  duration_days INTEGER NOT NULL DEFAULT 30,
  meetings_completed INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE, -- NULL = active, filled = completed/archived
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create unique partial index for one active assignment per setter
CREATE UNIQUE INDEX idx_unique_active_assignment 
ON public.setter_client_assignments (setter_id) 
WHERE status = 'active';

-- Create indexes for performance
CREATE INDEX idx_setter_assignments_setter ON public.setter_client_assignments(setter_id);
CREATE INDEX idx_setter_assignments_client ON public.setter_client_assignments(client_id);
CREATE INDEX idx_setter_assignments_status ON public.setter_client_assignments(status);
CREATE INDEX idx_setter_assignments_ends_at ON public.setter_client_assignments(ends_at);

-- Enable RLS
ALTER TABLE public.setter_client_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Admins can do everything
CREATE POLICY "Admins can manage all assignments"
ON public.setter_client_assignments
FOR ALL
TO authenticated
USING (public.is_admin_role(auth.uid()))
WITH CHECK (public.is_admin_role(auth.uid()));

-- Setters can view their own assignments
CREATE POLICY "Setters can view their own assignments"
ON public.setter_client_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.setters_profiles sp
    WHERE sp.id = setter_client_assignments.setter_id
    AND sp.user_id = auth.uid()
  )
);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_setter_client_assignments_updated_at
BEFORE UPDATE ON public.setter_client_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.setter_client_assignments;

-- ============================================================================
-- NOTIFICATION FUNCTION FOR TARGET COMPLETION
-- Fires when meetings_completed reaches meeting_target
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_assignment_target_reached()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_setter_name TEXT;
  v_setter_user_id UUID;
  v_client_name TEXT;
BEGIN
  -- Only trigger when meetings_completed changes and reaches target
  IF NEW.meetings_completed >= NEW.meeting_target 
     AND (OLD.meetings_completed < OLD.meeting_target OR OLD.meetings_completed IS NULL)
     AND NEW.status = 'active' THEN
    
    -- Get setter info
    SELECT sp.full_name, sp.user_id INTO v_setter_name, v_setter_user_id
    FROM setters_profiles sp
    WHERE sp.id = NEW.setter_id;
    
    -- Get client name
    SELECT cp.company_name INTO v_client_name
    FROM client_profiles cp
    WHERE cp.id = NEW.client_id;
    
    -- Notify ALL admin roles first
    INSERT INTO notifications (
      recipient_role,
      title,
      message,
      category,
      link_url,
      triggered_by
    )
    VALUES (
      'admin',
      '🎯 Meeting Target Reached',
      COALESCE(v_setter_name, 'Setter') || ' has reached their meeting target (' || 
        NEW.meetings_completed || '/' || NEW.meeting_target || ') for ' || 
        COALESCE(v_client_name, 'client') || '. They can now request a testimonial.',
      'achievement',
      '/admin/setters',
      v_setter_user_id
    );
    
    -- Notify the setter
    INSERT INTO notifications (
      recipient_role,
      recipient_id,
      title,
      message,
      category,
      link_url,
      triggered_by
    )
    VALUES (
      'setter',
      v_setter_user_id,
      '🎉 Goal Achieved!',
      'You''ve completed your meeting target for ' || COALESCE(v_client_name, 'your client') || 
        '! Consider requesting a testimonial from them.',
      'achievement',
      '/setter',
      v_setter_user_id
    );
    
    -- Mark assignment as completed
    NEW.status := 'completed';
    NEW.completed_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger to assignments table
CREATE TRIGGER trigger_notify_assignment_target_reached
BEFORE UPDATE ON public.setter_client_assignments
FOR EACH ROW
EXECUTE FUNCTION public.notify_assignment_target_reached();