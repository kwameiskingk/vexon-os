-- Add new fields to meetings table for expanded logging
ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS currently_hiring boolean,
ADD COLUMN IF NOT EXISTS hiring_difficulties text,
ADD COLUMN IF NOT EXISTS next_job_title text,
ADD COLUMN IF NOT EXISTS hiring_frequency text,
ADD COLUMN IF NOT EXISTS hiring_decision_maker text,
ADD COLUMN IF NOT EXISTS worked_with_agencies boolean,
ADD COLUMN IF NOT EXISTS other_notes text,
ADD COLUMN IF NOT EXISTS follow_up_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS client_accepted boolean DEFAULT false;

-- Add start_date and end_date to campaigns table
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS start_date date,
ADD COLUMN IF NOT EXISTS end_date date;

-- Create setter_feedback table
CREATE TABLE IF NOT EXISTS public.setter_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  mood text NOT NULL,
  challenges text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on setter_feedback
ALTER TABLE public.setter_feedback ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for setter_feedback
CREATE POLICY "Setters can insert their own feedback"
ON public.setter_feedback
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = setter_id AND has_role(auth.uid(), 'setter'::app_role));

CREATE POLICY "Setters can view their own feedback"
ON public.setter_feedback
FOR SELECT
TO authenticated
USING (auth.uid() = setter_id);

CREATE POLICY "Admins can view all feedback"
ON public.setter_feedback
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updating updated_at on setter_feedback
CREATE TRIGGER update_setter_feedback_updated_at
BEFORE UPDATE ON public.setter_feedback
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_setter_feedback_setter_id ON public.setter_feedback(setter_id);
CREATE INDEX IF NOT EXISTS idx_setter_feedback_date ON public.setter_feedback(date DESC);