-- Health (15 Oct 2026, the owner's Dev Centre ruling): cron + connections +
-- important errors only. The app cannot read the cron schema, so one
-- dev-only function returns every scheduled job with its last run. The
-- command itself is not returned (it carries headers); only the edge
-- function it calls. Safe to run twice.

CREATE OR REPLACE FUNCTION public.dev_cron_status()
RETURNS TABLE (
  jobname text,
  schedule text,
  active boolean,
  target text,
  last_start timestamptz,
  last_end timestamptz,
  last_status text,
  last_message text,
  runs_24h bigint,
  failures_24h bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    j.jobname::text,
    j.schedule::text,
    j.active,
    substring(j.command from 'functions/v1/([A-Za-z0-9_-]+)') AS target,
    l.start_time,
    l.end_time,
    l.status::text,
    l.return_message::text,
    (SELECT count(*) FROM cron.job_run_details d
       WHERE d.jobid = j.jobid AND d.start_time > now() - interval '24 hours'),
    (SELECT count(*) FROM cron.job_run_details d
       WHERE d.jobid = j.jobid AND d.start_time > now() - interval '24 hours' AND d.status <> 'succeeded')
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT d.start_time, d.end_time, d.status, d.return_message
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
    ORDER BY d.start_time DESC
    LIMIT 1
  ) l ON true
  WHERE public.has_role(auth.uid(), 'dev'::app_role)
  ORDER BY j.jobname;
$$;

REVOKE ALL ON FUNCTION public.dev_cron_status() FROM public;
GRANT EXECUTE ON FUNCTION public.dev_cron_status() TO authenticated;
COMMENT ON FUNCTION public.dev_cron_status() IS 'Dev Centre › Health: every pg_cron job with its last run. Empty for anyone without the dev role.';

-- sync_errors is admin-only by policy; the dev role reads and resolves them
-- from Health too. Same shape as the admin policy.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_errors' AND policyname = 'Dev manages sync errors') THEN
    CREATE POLICY "Dev manages sync errors" ON public.sync_errors FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'dev'::app_role))
      WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role));
  END IF;
END $$;

-- Proof: the number of jobs the Health screen will list, and the new policy.
SELECT (SELECT count(*) FROM cron.job) AS cron_jobs,
       (SELECT count(*) FROM pg_policies WHERE tablename = 'sync_errors' AND policyname = 'Dev manages sync errors') AS dev_policy;
