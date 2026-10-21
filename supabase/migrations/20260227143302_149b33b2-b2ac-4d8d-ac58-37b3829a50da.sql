
-- Add status and session_time columns to coaching_sessions
ALTER TABLE public.coaching_sessions 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS session_time TEXT;

-- Update existing sessions to 'completed' since they were created with full details
UPDATE public.coaching_sessions SET status = 'completed' WHERE observations IS NOT NULL OR improvements IS NOT NULL OR action_items IS NOT NULL;
