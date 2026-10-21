-- Vexon OS Bookings · Batch 4 — reminder cron. Every 5 minutes the
-- booking-send-reminders function drains due pending rows from
-- booking_notifications (24h/1h email + SMS reminders scheduled at booking
-- time).
--
-- APPLIED to prod 2026-08-19 via the hosted SQL connection together with
-- 20260819120000_booking_platform.sql (repair list: 20260819120000,
-- 20260819130000 — never `supabase db push` these).
--
-- Uses the hardcoded url + anon-key Bearer idiom of the crons that verifiably
-- fire in this project (sync-close-kpis, daily-consolidation) — the
-- current_setting('app.settings.*') idiom found in one newer migration was
-- checked on 2026-08-19 and those settings are NOT configured in this
-- database. The anon key is the publishable client key; it satisfies
-- verify_jwt, and the function does its real work with the service role from
-- its own environment.

SELECT cron.schedule(
  'booking-send-reminders',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/booking-send-reminders',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"}'::jsonb,
      body:='{"source":"cron"}'::jsonb
    ) as request_id;
  $$
);
