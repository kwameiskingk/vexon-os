-- Pipeline re-engagement (Batch 4 / W2): flag on meetings, written by the
-- new AE "Log discovery" modal at booking time. The CEO "Pipeline
-- Re-engagement Meetings Booked" tile counts these by created_at window.
-- (sales_discovery_logs.is_pipeline_reengagement already exists and gets
-- the flag propagated at completion for future conversion metrics.)
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS is_pipeline_reengagement boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_meetings_pipeline_reengagement
  ON public.meetings(created_at)
  WHERE is_pipeline_reengagement = true;
