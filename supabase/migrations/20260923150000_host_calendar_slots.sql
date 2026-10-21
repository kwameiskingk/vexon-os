-- 23 Sep 2026 (the owner + Elena): Trial Day slots ARE Elena's own calendar
-- entries. An event type can say "my slots are the host's calendar entries
-- whose title contains X"; booking then adds the candidate as a guest to
-- that entry instead of creating a new one, and several candidates may share
-- one entry (slot_capacity NULL = unlimited).

ALTER TABLE public.booking_event_types
  ADD COLUMN IF NOT EXISTS host_calendar_slots text,
  ADD COLUMN IF NOT EXISTS slot_capacity integer;

COMMENT ON COLUMN public.booking_event_types.host_calendar_slots IS
  'When set, bookable slots are the host''s own calendar entries whose title contains this text; booking adds the invitee as a guest to that entry.';
COMMENT ON COLUMN public.booking_event_types.slot_capacity IS
  'Max bookings per host-calendar entry (NULL = unlimited). Only used with host_calendar_slots.';

-- A booking that joined a shared host entry must not collide with the others
-- in the same entry, so it opts out of the one-per-host-per-time rule.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS shared_slot boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_double_booking;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_no_double_booking
  EXCLUDE USING gist (host_user_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status IN ('held', 'confirmed') AND NOT shared_slot);

-- The Trial Day event uses it from day one.
UPDATE public.booking_event_types
  SET host_calendar_slots = 'Trial Day', slot_capacity = NULL, updated_at = now()
  WHERE slug = 'live-call-trial-msp-k4n7p';

SELECT slug, host_calendar_slots, slot_capacity FROM public.booking_event_types WHERE slug = 'live-call-trial-msp-k4n7p';
