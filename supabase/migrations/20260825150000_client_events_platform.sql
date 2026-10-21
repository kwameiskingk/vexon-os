-- Client events platform (Daniel's client-Calendly doc, design 2026-08-25):
-- per-booking video/phone choice + static Teams/Zoom meeting-room links.
-- Timezone support needs NO schema change (booking_availability_rules.timezone
-- and booking_event_types.lock_timezone already exist); the Europe/London
-- hardcodes are code fixes in booking-client-admin / booking-flow.
-- NOT YET APPLIED. Apply via the hosted SQL editor (never `supabase db push`)
-- and add 20260825150000 to the migration repair list. Idempotent.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='booking_event_types'
      AND column_name='static_meeting_link'
  ) THEN
    RAISE NOTICE 'client events platform columns already present — skipping';
    RETURN;
  END IF;

  -- (b) provider enum widened + the client's personal Teams/Zoom room link.
  -- Google's Calendar API can only mint Google Meet conferences, so Teams and
  -- Zoom clients carry their own static room URL into the invite instead.
  ALTER TABLE public.booking_event_types
    DROP CONSTRAINT IF EXISTS booking_event_types_location_type_check;
  ALTER TABLE public.booking_event_types
    ADD CONSTRAINT booking_event_types_location_type_check
    CHECK (location_type IN ('google_meet','teams','zoom','phone','in_person'));
  ALTER TABLE public.booking_event_types
    ADD COLUMN static_meeting_link text,
    ADD COLUMN offer_phone_choice boolean NOT NULL DEFAULT false;
  -- Deliberately NO CHECK tying static_meeting_link to teams/zoom: CSMs set
  -- the provider before the client sends their room URL, and booking-flow
  -- falls back to a Google Meet link (with a warning) until it is filled in.

  -- (a) per-booking location choice. NULL = event default, so every legacy
  -- row keeps exactly the meaning it had (video unless the event is a phone
  -- event).
  ALTER TABLE public.bookings
    ADD COLUMN location_choice text
      CHECK (location_choice IN ('video','phone'));
END $$;

-- No RLS changes: both tables already carry the policies from 20260819120000,
-- and every write flows through service-role edge functions.
