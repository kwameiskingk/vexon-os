-- Pre-app meeting history for native client health (the owner ruling 4,
-- 2026-07-15). Some clients' sheets count meetings that never existed in
-- the platform (e.g. Edwards & Pearce: sheet 24 booked vs 16 app rows).
-- These columns carry that history as OFFSETS, not sheet totals:
--   opening_booked = sheet booked total  − platform booked at seed time
--   opening_sat    = sheet sat total     − platform sat at seed time
-- (both computed under the health counting rules: due meetings only, no
-- rescheduled rows, rebooks included; clamped at 0), so native totals =
-- offset + live platform count without double-counting. Seeded via the
-- existing SeedOpeningBalancesButton. RLS unchanged (admin/dev manage,
-- staff read).
ALTER TABLE public.client_health_opening_balances
  ADD COLUMN IF NOT EXISTS opening_booked integer,
  ADD COLUMN IF NOT EXISTS opening_sat integer;
