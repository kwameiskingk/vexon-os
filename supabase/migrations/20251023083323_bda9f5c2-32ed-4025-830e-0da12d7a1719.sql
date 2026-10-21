-- Add hourly KPI sync cron job (08:00-21:00 SAST = 06:00-19:00 UTC)
-- Run every hour during business hours
SELECT cron.schedule(
  'hourly-kpi-sync',
  '0 6-19 * * *',
  $$
  SELECT
    net.http_post(
        url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-close-kpis',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);