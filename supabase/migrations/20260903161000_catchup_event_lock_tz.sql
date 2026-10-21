-- Catch-up with Daniel event + UK-locked client events + Marcus rule dedupe
-- (3 Sep 2026). Applied by the owner via the hosted SQL editor; migration
-- bookkeeping unaware. Never `supabase db push`. Repair list:
--   supabase migration repair --status applied 20260903161000
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING / row_number dedupe.
--
-- What this does and why:
--   1. Removes exact-duplicate availability rules for Marcus (same host,
--      weekday, start, end, timezone and event scope), keeping the oldest
--      row. Duplicates crept in through repeated Dev Center saves; they are
--      harmless to the engine but confusing to read.
--   2. Seeds a SEPARATE 30-minute "Catch-up with Daniel" event for clients
--      inside their portal (the owner's ruling, 3 Sep): pick a time, no
--      questions, UK time locked, invite_only so it is never publicly listed.
--      Daniel (b55bfa88-fd26-46d6-8214-9d7aecf4064e) is the only host; his
--      default availability rules already exist (26 Aug seed) and apply.
--   3. Locks the onboarding call event to Europe/London too, so the in-portal
--      picker and the public page agree with each other.
--   4. Gives Marcus's Live Call Trial its OWN Saturday + Sunday hours
--      (Elena, 3 Sep: weekend LCTs could not be booked). The slot engine's
--      25 Aug rule is untouched: when an event has override rows they replace
--      the host's defaults for the whole week, so the LCT (Mon-Fri 17:45-19:00
--      overrides) never saw Marcus's Sat/Sun default hours. Rather than change
--      the engine for every event (which would have opened weekend Final
--      Interviews too, against the explicit 25 Aug intent), this seeds LCT-
--      scoped Sat/Sun rows copied from his default weekend hours, falling back
--      to 09:00-17:00 when no default weekend row exists. Only the LCT changes.
--      No edge-function redeploy is needed for this part.
--
-- App code degrades gracefully before this runs: the Communications "Book a
-- call" dialog shows "not set up yet, email Daniel" until the event exists.

-- ── 1. Marcus: drop exact-duplicate availability rules, keep the oldest ────
DO $$
DECLARE
  v_ceo uuid := 'a59995b2-0ecd-4aa0-8698-a8399d4423dd';
  v_removed int;
BEGIN
  IF to_regclass('public.booking_availability_rules') IS NULL THEN
    RAISE NOTICE 'booking_availability_rules missing, skipping dedupe';
    RETURN;
  END IF;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY host_user_id, weekday, start_time, end_time, timezone, event_type_id
             ORDER BY created_at, id
           ) AS rn
    FROM public.booking_availability_rules
    WHERE host_user_id = v_ceo
  ),
  gone AS (
    DELETE FROM public.booking_availability_rules r
    USING ranked
    WHERE r.id = ranked.id AND ranked.rn > 1
    RETURNING r.id
  )
  SELECT count(*) INTO v_removed FROM gone;

  RAISE NOTICE 'Marcus availability dedupe: removed % duplicate rule(s)', v_removed;
END $$;

-- ── 2. "Catch-up with Daniel" (client portal, 30 min, UK time, no questions)
INSERT INTO public.booking_event_types
  (name, slug, description, duration_minutes, questions, location_type, side, is_active,
   accepting_bookings, invite_only, lock_timezone, round_robin, staff_mode, default_source)
SELECT
  'Catch-up with Daniel', 'catch-up-with-daniel-msp',
  'A 30-minute catch-up with Daniel, your Customer Success Manager. Pick a time that suits you and the invite lands in your inbox.',
  30, '[]'::jsonb, 'google_meet', 'fulfilment', true,
  true, true, 'Europe/London', false, false, 'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM public.booking_event_types WHERE slug = 'catch-up-with-daniel-msp'
);

INSERT INTO public.booking_event_hosts (event_type_id, host_user_id, host_calendar_email, priority)
SELECT id, 'b55bfa88-fd26-46d6-8214-9d7aecf4064e', 'daniel@meridiansales.example', 1
  FROM public.booking_event_types WHERE slug = 'catch-up-with-daniel-msp'
ON CONFLICT (event_type_id, host_user_id) DO NOTHING;

-- ── 3. Onboarding call: UK time locked as well ─────────────────────────────
UPDATE public.booking_event_types
SET lock_timezone = 'Europe/London', updated_at = now()
WHERE slug = 'onboarding-call-msp-a7w3k'
  AND (lock_timezone IS DISTINCT FROM 'Europe/London');

-- ── 4. Marcus: Live Call Trial weekend hours (LCT-scoped override rows) ────
-- Per weekend day: copy the default (event_type_id IS NULL) rows for that day
-- into the LCT scope; if there is none, insert 09:00-17:00 inheriting
-- timezone/buffer/notice/cap from the LCT's existing weekday overrides.
-- Guarded per (weekday, start_time) so re-running adds nothing.
DO $$
DECLARE
  v_host uuid := 'a59995b2-0ecd-4aa0-8698-a8399d4423dd';  -- Marcus
  v_lct  uuid;
  v_tz text; v_buffer int; v_notice int; v_cap int;
  v_day int;
  v_added int := 0;
  v_n int;
BEGIN
  IF to_regclass('public.booking_availability_rules') IS NULL THEN
    RAISE NOTICE 'booking_availability_rules missing, skipping LCT weekend seed';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'booking_availability_rules'
      AND column_name = 'event_type_id'
  ) THEN
    RAISE NOTICE 'per-event availability (25 Aug) not applied yet, skipping LCT weekend seed';
    RETURN;
  END IF;

  SELECT id INTO v_lct FROM public.booking_event_types WHERE slug = 'live-call-trial-msp-k4n7p';
  IF v_lct IS NULL THEN
    RAISE NOTICE 'live-call-trial-msp-k4n7p not found, skipping LCT weekend seed';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.booking_event_hosts WHERE event_type_id = v_lct AND host_user_id = v_host
  ) THEN
    RAISE NOTICE 'Marcus is not a host on the Live Call Trial, skipping LCT weekend seed';
    RETURN;
  END IF;

  -- Settings for the fallback rows: whatever his LCT weekday overrides use.
  SELECT r.timezone, r.buffer_minutes, r.min_notice_minutes, r.daily_cap
    INTO v_tz, v_buffer, v_notice, v_cap
  FROM public.booking_availability_rules r
  WHERE r.host_user_id = v_host AND r.event_type_id = v_lct
  ORDER BY r.weekday, r.start_time
  LIMIT 1;
  v_tz     := COALESCE(v_tz, 'Europe/London');
  v_buffer := COALESCE(v_buffer, 0);
  v_notice := COALESCE(v_notice, 120);

  FOREACH v_day IN ARRAY ARRAY[0, 6] LOOP  -- 0 = Sunday, 6 = Saturday
    -- a. Copy the default weekend hours for this day into the LCT scope.
    INSERT INTO public.booking_availability_rules
      (host_user_id, event_type_id, weekday, start_time, end_time,
       timezone, buffer_minutes, min_notice_minutes, daily_cap)
    SELECT d.host_user_id, v_lct, d.weekday, d.start_time, d.end_time,
           d.timezone, d.buffer_minutes, d.min_notice_minutes, d.daily_cap
    FROM public.booking_availability_rules d
    WHERE d.host_user_id = v_host AND d.event_type_id IS NULL AND d.weekday = v_day
      AND NOT EXISTS (
        SELECT 1 FROM public.booking_availability_rules o
        WHERE o.host_user_id = v_host AND o.event_type_id = v_lct
          AND o.weekday = d.weekday AND o.start_time = d.start_time
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_added := v_added + v_n;

    -- b. No default hours for this day at all: fall back to 09:00-17:00.
    IF NOT EXISTS (
      SELECT 1 FROM public.booking_availability_rules
      WHERE host_user_id = v_host AND event_type_id = v_lct AND weekday = v_day
    ) THEN
      INSERT INTO public.booking_availability_rules
        (host_user_id, event_type_id, weekday, start_time, end_time,
         timezone, buffer_minutes, min_notice_minutes, daily_cap)
      VALUES (v_host, v_lct, v_day, '09:00'::time, '17:00'::time,
              v_tz, v_buffer, v_notice, v_cap);
      v_added := v_added + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'LCT weekend seed: added % row(s) for host % on event %', v_added, v_host, v_lct;
END $$;
