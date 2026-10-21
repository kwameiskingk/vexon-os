-- Accepting-bookings pause (the owner, 2026-08-20): a softer switch than
-- is_active. is_active=false kills the link entirely ("not available");
-- accepting_bookings=false keeps the page up but flips the pill to
-- "Not currently accepting bookings", greys the calendar, and the engine
-- refuses availability/booking server-side. Toggled from Dev Center →
-- Bookings → Event types.
-- APPLIED to prod 2026-08-20 via the hosted SQL connection
-- (repair list: 20260820160000).

ALTER TABLE public.booking_event_types
  ADD COLUMN accepting_bookings boolean NOT NULL DEFAULT true;
