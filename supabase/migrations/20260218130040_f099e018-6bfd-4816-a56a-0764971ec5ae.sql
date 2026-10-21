
-- Create post_pitch_call_feedback table (mirrors post_discovery_feedback but for pitch/follow-up calls)
CREATE TABLE public.post_pitch_call_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_call_id UUID NOT NULL REFERENCES public.pitch_calls(id) ON DELETE CASCADE,
  ae_user_id UUID NOT NULL,
  client_name TEXT NOT NULL,
  company_name TEXT,
  call_date TEXT NOT NULL,
  call_recording_link TEXT NOT NULL,

  -- Pitch-specific scoring (1-10)
  proposal_clarity_score INTEGER NOT NULL DEFAULT 5,
  objection_handling_score INTEGER NOT NULL DEFAULT 5,
  closing_confidence_score INTEGER NOT NULL DEFAULT 5,
  decision_timeline_score INTEGER NOT NULL DEFAULT 5,
  competitor_awareness_score INTEGER NOT NULL DEFAULT 5,

  -- Detailed notes
  summary TEXT NOT NULL DEFAULT '',
  proposal_presented TEXT NOT NULL DEFAULT '',
  objections_raised TEXT NOT NULL DEFAULT '',
  objections_handled TEXT NOT NULL DEFAULT '',
  competitor_mentions TEXT NOT NULL DEFAULT '',
  pricing_discussion TEXT NOT NULL DEFAULT '',
  next_steps_agreed TEXT NOT NULL DEFAULT '',
  blockers_to_close TEXT NOT NULL DEFAULT '',

  -- Self-review
  ae_what_went_well TEXT NOT NULL DEFAULT '',
  ae_what_to_improve TEXT NOT NULL DEFAULT '',
  support_needed TEXT NOT NULL DEFAULT '',

  -- Admin review
  status TEXT NOT NULL DEFAULT 'submitted',
  admin_commentary TEXT,
  admin_rating INTEGER,
  coaching_action_items TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.post_pitch_call_feedback ENABLE ROW LEVEL SECURITY;

-- AEs can view their own feedback
CREATE POLICY "AEs can view own pitch call feedback"
  ON public.post_pitch_call_feedback FOR SELECT
  TO authenticated
  USING (ae_user_id = auth.uid() OR public.is_admin_role(auth.uid()));

-- AEs can insert their own feedback
CREATE POLICY "AEs can insert own pitch call feedback"
  ON public.post_pitch_call_feedback FOR INSERT
  TO authenticated
  WITH CHECK (ae_user_id = auth.uid());

-- AEs can update their own submitted feedback; admins can update any
CREATE POLICY "AEs and admins can update pitch call feedback"
  ON public.post_pitch_call_feedback FOR UPDATE
  TO authenticated
  USING (ae_user_id = auth.uid() OR public.is_admin_role(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_post_pitch_call_feedback_updated_at
  BEFORE UPDATE ON public.post_pitch_call_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add has_feedback column to pitch_calls for quick checking
ALTER TABLE public.pitch_calls ADD COLUMN IF NOT EXISTS has_feedback BOOLEAN DEFAULT false;
