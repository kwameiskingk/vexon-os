-- 12 Oct 2026 (acquisition PR A3, Move appointment): a reschedule now moves
-- the existing booking and meeting instead of creating a rebook twin. These
-- columns keep where it moved from. Safe to run twice.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rescheduled_from timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS moved_from timestamptz;
