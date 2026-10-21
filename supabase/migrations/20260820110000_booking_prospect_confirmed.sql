-- Prospect attendance confirmation (the owner, 2026-08-20 after the first
-- successful end-to-end booking): the branded confirmation email gains a
-- "Confirm attendance" button → /bookings/confirm/<booking_id> → booking-public
-- action "confirm" stamps this column and marks the linked meeting
-- client_accepted/accepted_by_client, so setters can get live confirmation
-- while still on the call.
-- APPLIED to prod 2026-08-20 via the hosted SQL connection
-- (repair list: 20260820110000).

ALTER TABLE public.bookings ADD COLUMN prospect_confirmed_at timestamptz;
