-- 2 Oct 2026 (Marcus): no client booking page offers slots more than 7 days
-- ahead. The slot engine now caps client events at 7 regardless; this sets the
-- stored value to match so the admin screens say the same. Safe to run twice.
UPDATE public.booking_event_types
SET booking_horizon_days = 7
WHERE client_id IS NOT NULL AND (booking_horizon_days IS NULL OR booking_horizon_days > 7);
