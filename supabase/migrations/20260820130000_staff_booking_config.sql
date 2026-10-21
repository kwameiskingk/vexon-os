-- Marcus's booking redesign (dev catch-up 2026-08-20): setters stop using the
-- in-app form and book through the public page like Calendly. Event-type
-- config to support it:
--   lock_timezone  — display times in this zone only, hide the selector
--   round_robin    — merge host availability; assign a host at booking time
--   staff_mode     — Close-lead-link autofill + auto-log a dashboard meeting
--                    when a signed-in staff member books
--   default_source — meetings.appointment_source for auto-logged bookings
--                    (the link IS the source, per Marcus)
-- APPLIED to prod 2026-08-20 via the hosted SQL connection, together with a
-- data seed on the cold-call event (📈 title, 4 qual questions, Rory+Oliver
-- hosts, Oliver availability copied from Rory).
-- (repair list: 20260820130000)

ALTER TABLE public.booking_event_types
  ADD COLUMN lock_timezone text,
  ADD COLUMN round_robin boolean NOT NULL DEFAULT false,
  ADD COLUMN staff_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN default_source text;
