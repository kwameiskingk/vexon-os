-- Booked becomes WEEKLY-only (A1 ruling, 2026-07-22).
--
-- The fulfilment role default for booked moves from 1/day to 5/week.
-- 5 = the daily-intent equivalent (1 × 5 working days) — a PLACEHOLDER
-- pending Nadia's real weekly number. Grain split after this change:
--   dials + talk_minutes = DAILY  (accrue per worked day)
--   booked + sat         = WEEKLY (paced by the team curve, absence-adjusted)
--
-- Idempotent; safe to re-run. Note: with the current even curve and full
-- attendance, 5/week produces the same expected-to-date as 1/day did — the
-- switch causes no jump on apply; differences appear only once Nadia sets a
-- non-even curve shape.

UPDATE public.role_target_defaults
SET period = 'week', target_value = 5, updated_at = now()
WHERE role = 'setter' AND department = 'fulfilment' AND metric = 'booked'
  AND period = 'day';
