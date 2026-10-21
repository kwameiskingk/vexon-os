-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule hourly KPI sync (runs every hour, 24/7)
SELECT cron.schedule(
  'hourly-close-kpi-sync',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-close-kpis',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Schedule daily consolidation at 19:00 UTC (21:00 South Africa time)
SELECT cron.schedule(
  'daily-consolidation',
  '0 19 * * *', -- Every day at 19:00 UTC
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-consolidation',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Schedule daily cleanup of previous day's live data at 22:00 UTC (00:00 SA)
SELECT cron.schedule(
  'daily-cleanup-previous-day',
  '0 22 * * *', -- Every day at 22:00 UTC
  $$
  DELETE FROM performance 
  WHERE date < CURRENT_DATE;
  $$
);