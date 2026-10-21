-- Marcus, 6 Oct 2026: every Kronos booking gets a text at booking, then email
-- and text 24 hours before and 3 hours before. New bookings queue reminder_3h
-- (booking-flow.ts). Pending 1-hour rows for bookings still ahead move to
-- 3 hours before the start where that moment is still in the future; the rest
-- stay and send at 1 hour. Safe to run twice (nothing matches on a rerun).
UPDATE public.booking_notifications n
SET template = 'reminder_3h', scheduled_for = b.starts_at - interval '3 hours'
FROM public.bookings b
WHERE b.id = n.booking_id
  AND n.template = 'reminder_1h'
  AND n.status = 'pending'
  AND b.starts_at - interval '3 hours' > now();

SELECT template, channel, status, count(*)
FROM public.booking_notifications
WHERE scheduled_for > now()
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
