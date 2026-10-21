-- Kronos callbacks on client booking pages (16 Oct 2026, the owner).
--
-- On a client event the "Phone call" choice becomes a Callback: a 15-minute
-- call from the client to the prospect, bookable today or on the next two
-- working days (UK time), on the client's real free time. A callback is a
-- booking with location_choice = 'phone' on a client event; nothing new is
-- needed to mark it.
--
--   1. booking_event_types.callback_notice_minutes: how soon a callback can
--      be booked from now. 30 by default (the owner); editable per client in
--      the client's Config > Bookings.
--   2. bookings.callback_backup_times: other times the prospect said they
--      could take the call if the booked one fails. Shown on the client's
--      invite and in Move appointment, where one click moves the callback.
--
-- Safe to run twice.

ALTER TABLE public.booking_event_types
  ADD COLUMN IF NOT EXISTS callback_notice_minutes integer NOT NULL DEFAULT 30;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_event_types_callback_notice_range') THEN
    ALTER TABLE public.booking_event_types
      ADD CONSTRAINT booking_event_types_callback_notice_range
      CHECK (callback_notice_minutes BETWEEN 0 AND 1440);
  END IF;
END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS callback_backup_times timestamptz[];

COMMENT ON COLUMN public.booking_event_types.callback_notice_minutes IS
  'Callbacks (client events): minimum minutes between now and the earliest bookable callback. the owner, 16 Oct 2026.';
COMMENT ON COLUMN public.bookings.callback_backup_times IS
  'Callbacks: other times the prospect could take the call (UK), up to two. the owner, 16 Oct 2026.';

-- Proof: both columns, the range check, and every client event now at 30.
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
     AND ((table_name = 'booking_event_types' AND column_name = 'callback_notice_minutes')
       OR (table_name = 'bookings' AND column_name = 'callback_backup_times'))) AS columns_expect_2,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'booking_event_types_callback_notice_range') AS check_expect_1,
  (SELECT count(*) FROM public.booking_event_types WHERE client_id IS NOT NULL AND callback_notice_minutes = 30) AS client_events_at_30;
