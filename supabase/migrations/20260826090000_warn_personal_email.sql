-- Per-event "that looks like a personal email address" prompt.
--
-- The guard previously fired only for outbound SETTER bookings (staff_mode +
-- a signed-in staff member). Oliver's own discovery link is public — the
-- prospect books themselves — but he still wants the prompt (the owner, 26 Aug).
-- Per-event rather than global so the Meta/LinkedIn ads link is unaffected,
-- where nudging people away from a personal address would cost conversions.
--
-- A self-booking prospect only has to confirm the address; a setter still has
-- to give a reason, which the AE reads.
--
-- Apply via the hosted SQL editor (never `supabase db push`); add
-- 20260826090000 to the migration repair list. Idempotent.

ALTER TABLE public.booking_event_types
  ADD COLUMN IF NOT EXISTS warn_personal_email boolean NOT NULL DEFAULT false;

UPDATE public.booking_event_types
  SET warn_personal_email = true
  WHERE slug = 'discovery-call-with-william';

-- Oliver asked for name, email and mobile only — no qualification questions
-- on his link.
UPDATE public.booking_event_types
  SET questions = '[]'::jsonb
  WHERE slug = 'discovery-call-with-william';
