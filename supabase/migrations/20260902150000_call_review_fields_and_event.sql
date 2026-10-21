-- Log a Call Review — structured fields + Marcus's 30-min booking event.
-- APPLY VIA THE HOSTED SQL EDITOR (not auto-applied from this repo).
-- Idempotent: IF NOT EXISTS / WHERE NOT EXISTS / ON CONFLICT guards.
--
-- Marcus's 2 Sep spec: a call review is a standardised 30-minute session with
-- a setter — booked onto BOTH calendars (Google emails the setter the
-- invite), completed afterwards with the Fathom link and the TWO priorities
-- the setter is working on, and reported weekly/monthly per setter.
-- The app degrades gracefully until this runs: the slot picker simply doesn't
-- render (missing event resolves to null → manual date/time), and the new
-- columns are written by guarded separate updates that warn instead of fail.

-- ── 1. Structured call-review fields on coaching_sessions ──────────────────
ALTER TABLE public.coaching_sessions
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS fathom_link text,
  ADD COLUMN IF NOT EXISTS priority_1 text,
  ADD COLUMN IF NOT EXISTS priority_2 text,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.coaching_sessions.priority_1 IS
  'Call review: first of the two things the setter is working on (Marcus 2 Sep). Mirrored into improvements for legacy surfaces.';
COMMENT ON COLUMN public.coaching_sessions.booking_id IS
  'Vexon OS Bookings row when the session was booked as a live slot — ties the review to the calendar event.';

-- ── 2. Marcus's call-review booking event ──────────────────────────────────
-- Mirrors the follow-up-with-marcus seed (20260827091000): unguessable slug,
-- invite_only so it is never publicly listed, no event_purpose so the AE
-- personal-event resolver (discovery/follow_up) can never pick it up.
-- side='fulfilment' keeps it invisible to the setter wizard (which reads the
-- acquisition side).
INSERT INTO public.booking_event_types
  (name, slug, description, duration_minutes, questions, location_type, side, is_active,
   lock_timezone, round_robin, staff_mode, accepting_bookings, offer_phone_choice,
   invite_only, warn_personal_email, owner_user_id, event_purpose)
SELECT
  'Call Review with Marcus', 'call-review-msp-s9x4m',
  'A 30-minute call review — we''ll go through a recent call together and agree the two priorities to work on next.',
  30, '[]'::jsonb, 'google_meet', 'fulfilment', true,
  'Europe/London', false, false, true, false,
  true, false, 'a59995b2-0ecd-4aa0-8698-a8399d4423dd', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.booking_event_types WHERE slug = 'call-review-msp-s9x4m'
);

INSERT INTO public.booking_event_hosts (event_type_id, host_user_id, host_calendar_email, priority)
SELECT id, 'a59995b2-0ecd-4aa0-8698-a8399d4423dd', 'marcus@meridiansales.example', 1
  FROM public.booking_event_types WHERE slug = 'call-review-msp-s9x4m'
ON CONFLICT (event_type_id, host_user_id) DO NOTHING;
