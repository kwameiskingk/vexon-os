-- 17 Sep 2026 (Marcus): "can I make my availability for follow-up calls
-- unlimited — someone can book themselves 6 months into the future?"
-- Per-event booking horizon. NULL keeps today's behaviour (31 days).
-- Apply via the hosted SQL editor, never `supabase db push`. Idempotent.
ALTER TABLE public.booking_event_types
  ADD COLUMN IF NOT EXISTS booking_horizon_days integer
  CHECK (booking_horizon_days IS NULL OR (booking_horizon_days BETWEEN 1 AND 365));

COMMENT ON COLUMN public.booking_event_types.booking_horizon_days IS
  'How many days ahead people may book this event. NULL = 31 (the default window).';

-- Verify (the editor shows no row counts, so end with a SELECT).
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'booking_event_types'
   AND column_name = 'booking_horizon_days';
