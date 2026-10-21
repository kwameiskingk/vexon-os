-- Repoint cron from hourly-update-notify to midday-report-notify at noon UK (Mon-Fri)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job
    WHERE command ILIKE '%hourly-update-notify%'
       OR jobname ILIKE '%hourly-update-notify%'
       OR jobname ILIKE '%hourly_update_notify%'
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;

  FOR r IN SELECT jobname FROM cron.job WHERE jobname = 'midday-report-notify-noon-uk'
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

-- Schedule midday-report-notify at 12:00 UK time, Monday-Friday.
-- UK is UTC in winter (GMT) and UTC+1 in summer (BST). pg_cron runs in UTC.
-- We schedule at both 11:00 UTC (BST) and 12:00 UTC (GMT); the edge function
-- itself guards with `if (ukHour !== 12) return` so only the correct one fires.
SELECT cron.schedule(
  'midday-report-notify-bst',
  '0 11 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/midday-report-notify',
    headers := '{"Content-Type": "application/json", "apikey": "YOUR_SUPABASE_ANON_KEY"}'::jsonb,
    body := jsonb_build_object('time', now())
  );
  $cron$
);

SELECT cron.schedule(
  'midday-report-notify-gmt',
  '0 12 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/midday-report-notify',
    headers := '{"Content-Type": "application/json", "apikey": "YOUR_SUPABASE_ANON_KEY"}'::jsonb,
    body := jsonb_build_object('time', now())
  );
  $cron$
);