-- 8 Oct 2026 (the owner): a client's public booking link asks the prospect the
-- prospect-worded hiring questions. This switch (Dev Centre → Bookings → Event
-- types, client events) turns those questions off for one event, leaving the
-- prospect with contact details and a time. Setters signed in always answer
-- Marcus's full tree; this only affects the signed-out public page.
ALTER TABLE public.booking_event_types
  ADD COLUMN IF NOT EXISTS public_quals_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.booking_event_types.public_quals_enabled IS
  'Client events: prospect-worded hiring questions on the signed-out public link (default on).';
