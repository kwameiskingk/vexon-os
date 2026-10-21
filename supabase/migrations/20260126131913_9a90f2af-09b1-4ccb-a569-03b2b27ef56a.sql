-- Create post_discovery_feedback table
CREATE TABLE public.post_discovery_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  discovery_log_id UUID NOT NULL REFERENCES public.sales_discovery_logs(id) ON DELETE CASCADE,
  ae_user_id UUID NOT NULL,
  client_name TEXT NOT NULL,
  call_date TIMESTAMPTZ NOT NULL,
  call_recording_link TEXT NOT NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('discovery', 'follow_up')),
  
  -- Scoring (1-10)
  icp_fit_score INTEGER NOT NULL CHECK (icp_fit_score >= 1 AND icp_fit_score <= 10),
  pain_severity_score INTEGER NOT NULL CHECK (pain_severity_score >= 1 AND pain_severity_score <= 10),
  urgency_score INTEGER NOT NULL CHECK (urgency_score >= 1 AND urgency_score <= 10),
  budget_confidence_score INTEGER NOT NULL CHECK (budget_confidence_score >= 1 AND budget_confidence_score <= 10),
  decision_maker_access_score INTEGER NOT NULL CHECK (decision_maker_access_score >= 1 AND decision_maker_access_score <= 10),
  
  -- Detailed notes
  summary TEXT NOT NULL,
  key_pain_points TEXT NOT NULL,
  desired_outcome TEXT NOT NULL,
  decision_process TEXT NOT NULL,
  objections_raised TEXT NOT NULL,
  risks_to_close TEXT NOT NULL,
  next_steps_agreed TEXT NOT NULL,
  
  -- AE Self-review
  ae_what_went_well TEXT NOT NULL,
  ae_what_to_improve TEXT NOT NULL,
  support_needed_from_ceo TEXT NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed')),
  
  -- Admin review fields
  admin_commentary TEXT,
  coaching_action_items TEXT,
  admin_rating INTEGER CHECK (admin_rating >= 1 AND admin_rating <= 5),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate feedback for same discovery log
CREATE UNIQUE INDEX idx_post_discovery_feedback_unique_log ON public.post_discovery_feedback(discovery_log_id);

-- Create indexes for common queries
CREATE INDEX idx_post_discovery_feedback_ae_user ON public.post_discovery_feedback(ae_user_id);
CREATE INDEX idx_post_discovery_feedback_status ON public.post_discovery_feedback(status);
CREATE INDEX idx_post_discovery_feedback_created ON public.post_discovery_feedback(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.post_discovery_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policy: AEs can read their own feedback
CREATE POLICY "AEs can read own feedback"
ON public.post_discovery_feedback
FOR SELECT
USING (ae_user_id = auth.uid());

-- RLS Policy: AEs can insert their own feedback
CREATE POLICY "AEs can insert own feedback"
ON public.post_discovery_feedback
FOR INSERT
WITH CHECK (ae_user_id = auth.uid());

-- RLS Policy: Admin/Dev/Ops can read all feedback
CREATE POLICY "Admin roles can read all feedback"
ON public.post_discovery_feedback
FOR SELECT
USING (is_admin_role(auth.uid()));

-- RLS Policy: Admin/Dev/Ops can update all feedback (for review)
CREATE POLICY "Admin roles can update all feedback"
ON public.post_discovery_feedback
FOR UPDATE
USING (is_admin_role(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_post_discovery_feedback_updated_at
BEFORE UPDATE ON public.post_discovery_feedback
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create notification function for feedback submission
CREATE OR REPLACE FUNCTION notify_post_discovery_feedback_submitted()
RETURNS TRIGGER AS $$
DECLARE
  ae_name TEXT;
BEGIN
  -- Get AE name
  SELECT full_name INTO ae_name FROM public.profiles WHERE id = NEW.ae_user_id;
  
  -- Notify admins
  INSERT INTO public.notifications (user_id, title, message, link, category)
  SELECT 
    ur.user_id,
    'Post Discovery Feedback Submitted',
    'Post Discovery feedback submitted by ' || COALESCE(ae_name, 'AE') || ' for ' || NEW.client_name || '.',
    '/admin/sales/ae-management',
    'feedback'
  FROM public.user_roles ur
  WHERE ur.role IN ('admin', 'dev', 'ops');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for submission notification
CREATE TRIGGER on_post_discovery_feedback_submitted
AFTER INSERT ON public.post_discovery_feedback
FOR EACH ROW
EXECUTE FUNCTION notify_post_discovery_feedback_submitted();

-- Create notification function for feedback review
CREATE OR REPLACE FUNCTION notify_post_discovery_feedback_reviewed()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when status changes to 'reviewed'
  IF OLD.status = 'submitted' AND NEW.status = 'reviewed' THEN
    INSERT INTO public.notifications (user_id, title, message, link, category)
    VALUES (
      NEW.ae_user_id,
      'Feedback Reviewed',
      'Your Post Discovery feedback for ' || NEW.client_name || ' has been reviewed.',
      '/ae/post-discovery',
      'feedback'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for review notification
CREATE TRIGGER on_post_discovery_feedback_reviewed
AFTER UPDATE ON public.post_discovery_feedback
FOR EACH ROW
EXECUTE FUNCTION notify_post_discovery_feedback_reviewed();