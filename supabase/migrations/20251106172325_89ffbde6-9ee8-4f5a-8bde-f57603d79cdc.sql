-- Update meetings table with lifecycle management columns
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS assigned_to_client boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS attendance_confirmed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS attendance_status text DEFAULT 'pending' CHECK (attendance_status IN ('sat', 'no_show', 'rescheduled', 'cancelled', 'pending'));

-- Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  department text NOT NULL CHECK (department IN ('fulfilment', 'acquisition', 'operations')),
  assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_at timestamp with time zone,
  related_meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on tasks table
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tasks
CREATE POLICY "Admins can manage all tasks"
  ON public.tasks
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Setters can view tasks assigned to them"
  ON public.tasks
  FOR SELECT
  USING (
    has_role(auth.uid(), 'setter'::app_role) 
    AND (assigned_to_user_id = auth.uid() OR created_by_user_id = auth.uid())
  );

CREATE POLICY "Setters can create tasks for themselves"
  ON public.tasks
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'setter'::app_role)
    AND created_by_user_id = auth.uid()
    AND assigned_to_user_id = auth.uid()
  );

CREATE POLICY "Setters can update their own tasks"
  ON public.tasks
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'setter'::app_role)
    AND assigned_to_user_id = auth.uid()
  );

-- Add updated_at trigger for tasks
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create notification trigger for task assignments
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Notify assigned user
  IF NEW.assigned_to_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id,
      recipient_role,
      title,
      message,
      category,
      triggered_by
    )
    SELECT 
      NEW.assigned_to_user_id,
      ur.role,
      'New Task Assigned',
      'You have been assigned: ' || NEW.title,
      'meeting',
      NEW.created_by_user_id
    FROM user_roles ur
    WHERE ur.user_id = NEW.assigned_to_user_id
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_assigned_notification
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_assigned();