-- Booking calendar rules, 11 Sep 2026 (Marcus's 8 Sep walkthrough, Batch 3).
--
-- 1. Every client's booking page shows UK time (Marcus). Fourteen client
--    events are locked to Europe/London; DMD Consulting is a Dubai client
--    and stays on Asia/Dubai (the owner, 11 Sep).
-- 2. The 12-hour "no feedback → sat" rule moves to the server: an hourly
--    cron calls auto-sat-no-feedback (it used to run only when a client
--    opened their Meetings page).
-- 3. An hourly probe of every connected client calendar so a broken
--    connection is caught and raised before a booking hits it.
-- 4. client_calendar_status(): lets a signed-in client see whether their own
--    calendar connection is healthy (status only — never the tokens), for
--    the reconnect banner on their dashboard.
--
-- Safe to run twice. Applied by the owner via the hosted SQL editor. The cron
-- entries use the hardcoded url + anon-key Bearer idiom of the crons that
-- verifiably fire in this project (see 20260819130000).

-- ── 1. Timezone lock ───────────────────────────────────────────────────────
UPDATE public.booking_event_types
SET lock_timezone = 'Asia/Dubai'
WHERE client_id IN (SELECT id FROM public.client_profiles WHERE company_name = 'DMD Consulting')
  AND lock_timezone IS NULL;

UPDATE public.booking_event_types
SET lock_timezone = 'Europe/London'
WHERE client_id IS NOT NULL
  AND lock_timezone IS NULL;

-- ── 2 + 3. Hourly crons ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-sat-no-feedback') THEN
    PERFORM cron.schedule(
      'auto-sat-no-feedback',
      '10 * * * *',
      $job$
      SELECT net.http_post(
        url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/auto-sat-no-feedback',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"}'::jsonb,
        body:='{"source":"cron"}'::jsonb
      ) AS request_id;
      $job$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calendar-connection-probe') THEN
    PERFORM cron.schedule(
      'calendar-connection-probe',
      '40 * * * *',
      $job$
      SELECT net.http_post(
        url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/calendar-connection-probe',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"}'::jsonb,
        body:='{"source":"cron"}'::jsonb
      ) AS request_id;
      $job$
    );
  END IF;
END $$;

-- ── 4. Client-readable connection status ───────────────────────────────────
-- Returns one row per client profile the caller belongs to (direct user_id
-- or client_profile_users). Status only; the token columns never leave the
-- table. SECURITY DEFINER because clients have no policy on
-- calendar_connections and must not get one.
CREATE OR REPLACE FUNCTION public.client_calendar_status()
RETURNS TABLE (client_profile_id uuid, status text, last_checked_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT cc.client_profile_id, cc.status, cc.last_checked_at
  FROM public.calendar_connections cc
  WHERE cc.owner_type = 'client'
    AND cc.client_profile_id IN (
      SELECT cp.id FROM public.client_profiles cp WHERE cp.user_id = auth.uid()
      UNION
      SELECT cpu.client_profile_id FROM public.client_profile_users cpu WHERE cpu.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.client_calendar_status() FROM public;
GRANT EXECUTE ON FUNCTION public.client_calendar_status() TO authenticated;
