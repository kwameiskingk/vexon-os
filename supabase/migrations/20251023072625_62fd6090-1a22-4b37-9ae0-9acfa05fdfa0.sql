-- Schedule hourly Close API meeting sync (08:00-21:00 SAST = 06:00-19:00 UTC)
-- Run every hour during business hours
SELECT cron.schedule(
  'hourly-close-meetings-sync',
  '0 6-19 * * *',
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-close-meetings',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Schedule daily meetings consolidation at 21:00 SAST (19:00 UTC)
SELECT cron.schedule(
  'daily-meetings-consolidation',
  '0 19 * * *',
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/consolidate-meetings',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"}'::jsonb
  ) as request_id;
  $$
);