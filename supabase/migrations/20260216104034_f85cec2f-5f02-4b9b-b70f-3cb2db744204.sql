
-- Add AE reminder tracking columns to meetings
ALTER TABLE public.meetings 
  ADD COLUMN IF NOT EXISTS ae_today_reminder_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ae_outcome_reminder_sent boolean DEFAULT false;
