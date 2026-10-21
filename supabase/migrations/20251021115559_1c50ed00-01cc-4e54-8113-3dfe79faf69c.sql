-- Setup daily auto-sync for Close KPIs at 00:00 UTC
-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a cron job to sync KPIs daily at midnight UTC
SELECT cron.schedule(
  'daily-close-kpi-sync',
  '0 0 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-close-kpis',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);