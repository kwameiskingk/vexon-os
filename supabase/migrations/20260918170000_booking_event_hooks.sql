-- Booking hooks (18 Sep 2026): Zapier is cancelled. Each booking event can
-- add the prospect to a Kit (ConvertKit) sequence and/or POST every confirmed
-- booking to a webhook URL (n8n). Read by runBookingFlow; edited in
-- Event Bookings / Dev Centre. KIT_API_KEY lives in the hosted builder secrets.
ALTER TABLE public.booking_event_types
  ADD COLUMN IF NOT EXISTS kit_sequence_id text,
  ADD COLUMN IF NOT EXISTS webhook_url text;

-- Proof
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='booking_event_types' AND column_name='kit_sequence_id') AS kit_ok,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='booking_event_types' AND column_name='webhook_url') AS webhook_ok;
