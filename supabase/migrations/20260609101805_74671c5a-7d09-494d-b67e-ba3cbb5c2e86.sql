
-- Client meeting feedback columns
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS client_feedback_link TEXT,
  ADD COLUMN IF NOT EXISTS client_feedback_accepted BOOLEAN,
  ADD COLUMN IF NOT EXISTS client_feedback_sat BOOLEAN,
  ADD COLUMN IF NOT EXISTS client_feedback_decline_reason TEXT,
  ADD COLUMN IF NOT EXISTS client_feedback_terms_sent BOOLEAN,
  ADD COLUMN IF NOT EXISTS client_feedback_followup_booked BOOLEAN,
  ADD COLUMN IF NOT EXISTS client_feedback_rating INTEGER,
  ADD COLUMN IF NOT EXISTS client_feedback_comments TEXT,
  ADD COLUMN IF NOT EXISTS client_feedback_submitted_at TIMESTAMPTZ;
