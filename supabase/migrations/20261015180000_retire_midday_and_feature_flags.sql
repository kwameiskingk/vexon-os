-- Retire the midday report and feature flags (15 Oct 2026, the owner's Dev Centre rulings).
-- The midday form was never rendered (FormsPage imported it and never mounted it),
-- yet the noon notification cron still fired every weekday. Unschedule both jobs,
-- switch the setting off, and drop dev_feature_flags, which nothing read.
-- midday_reports history and midday_report_settings stay. Safe to run twice.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job
    WHERE jobname IN ('midday-report-notify-bst', 'midday-report-notify-gmt', 'midday-report-notify-noon-uk')
       OR command ILIKE '%midday-report-notify%'
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

UPDATE public.midday_report_settings SET enabled = false WHERE enabled;

DROP TABLE IF EXISTS public.dev_feature_flags;

-- Proof
SELECT
  (SELECT count(*) FROM cron.job WHERE command ILIKE '%midday-report-notify%') AS midday_jobs_left,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dev_feature_flags') AS flags_table_left,
  (SELECT coalesce(bool_or(enabled), false) FROM public.midday_report_settings) AS midday_enabled;
