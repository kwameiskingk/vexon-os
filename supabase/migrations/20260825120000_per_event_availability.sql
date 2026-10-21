-- Per-event availability overrides (Marcus: Live Call Trial 17:45–19:00,
-- Final Interview 09:00–17:00 — 2026-08-25).
-- booking_availability_rules gains a nullable event_type_id:
--   NULL = the host's default weekly hours (today's behaviour, untouched);
--   set  = override rows for that one event. If ANY override rows exist for
--          (host, event) they REPLACE the host's default rules for that event —
--          no merging. Otherwise the event falls back to the defaults.
-- Google free/busy still overlays in _shared/slot-engine.ts exactly as before.
-- RLS: unchanged — the existing authenticated-read + admin/dev-manage policies
-- on booking_availability_rules already cover the new column; anon stays revoked.
-- Apply via the hosted builder SQL editor (migration bookkeeping unaware — never
-- `supabase db push`; add to repair list: 20260825120000).
--
-- ⚠ SEQUENCING: run Part A, then redeploy booking-availability + booking-public
-- (they bundle _shared/slot-engine.ts), THEN run Part B. The old engine unions
-- every row for a host, so seeding before redeploy would add the 17:45–19:00
-- window to ALL of Marcus's events.

-- ── A. Schema — idempotent ───────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='booking_availability_rules'
      AND column_name='event_type_id'
  ) THEN
    RAISE NOTICE 'event_type_id already present — skipping schema part';
    RETURN;
  END IF;

  ALTER TABLE public.booking_availability_rules
    ADD COLUMN event_type_id uuid
      REFERENCES public.booking_event_types(id) ON DELETE CASCADE;

  -- The batch-1 uniqueness (host, weekday, start_time) would reject an
  -- override row starting at the same minute as a default row — replace it
  -- with scope-aware partial twins.
  ALTER TABLE public.booking_availability_rules
    DROP CONSTRAINT IF EXISTS
      booking_availability_rules_host_user_id_weekday_start_time_key;

  CREATE UNIQUE INDEX booking_availability_rules_host_default_key
    ON public.booking_availability_rules (host_user_id, weekday, start_time)
    WHERE host_user_id IS NOT NULL AND event_type_id IS NULL;

  CREATE UNIQUE INDEX booking_availability_rules_host_event_key
    ON public.booking_availability_rules (host_user_id, event_type_id, weekday, start_time)
    WHERE host_user_id IS NOT NULL AND event_type_id IS NOT NULL;

  -- Parity for client-keyed rows (the fulfilment build left them without a
  -- uniqueness net — NULL host_user_id escapes a plain UNIQUE entirely).
  -- Dedupe first so index creation cannot fail (save_rules delete-then-inserts,
  -- so none are expected).
  DELETE FROM public.booking_availability_rules a
  USING public.booking_availability_rules b
  WHERE a.client_profile_id IS NOT NULL
    AND b.client_profile_id = a.client_profile_id
    AND b.weekday = a.weekday
    AND b.start_time = a.start_time
    AND b.ctid < a.ctid;

  CREATE UNIQUE INDEX booking_availability_rules_client_default_key
    ON public.booking_availability_rules (client_profile_id, weekday, start_time)
    WHERE client_profile_id IS NOT NULL AND event_type_id IS NULL;

  CREATE UNIQUE INDEX booking_availability_rules_client_event_key
    ON public.booking_availability_rules (client_profile_id, event_type_id, weekday, start_time)
    WHERE client_profile_id IS NOT NULL AND event_type_id IS NOT NULL;

  CREATE INDEX booking_availability_rules_event_idx
    ON public.booking_availability_rules (event_type_id)
    WHERE event_type_id IS NOT NULL;
END $$;

-- ── B. Seed — Marcus's two overrides. Run AFTER redeploying the two edge
-- functions (see header). Idempotent: delete-then-insert per event. ──────────
DO $$
DECLARE
  v_lct  uuid;  -- live-call-trial-msp-k4n7p
  v_fi   uuid;  -- final-interview-msp-m8q2w
  v_host uuid := 'a59995b2-0ecd-4aa0-8698-a8399d4423dd';  -- Marcus (known UUID)
  v_tz text; v_buffer int; v_notice int; v_cap int;
BEGIN
  SELECT id INTO v_lct FROM public.booking_event_types
    WHERE slug = 'live-call-trial-msp-k4n7p';
  -- Accept the shortened slug too: the event editor let it be renamed to
  -- 'final-interview' on 25 Aug, and the restore may not have run yet.
  SELECT id INTO v_fi FROM public.booking_event_types
    WHERE slug IN ('final-interview-msp-m8q2w', 'final-interview');
  IF v_lct IS NULL OR v_fi IS NULL THEN
    RAISE EXCEPTION 'per-event seed: event slug(s) missing — check live-call-trial-msp-k4n7p / final-interview-msp-m8q2w';
  END IF;

  -- Verify the known UUID really is a host on BOTH events before touching rows.
  IF NOT EXISTS (
    SELECT 1 FROM public.booking_event_hosts
    WHERE event_type_id = v_lct AND host_user_id = v_host
  ) THEN
    RAISE EXCEPTION 'per-event seed: host % is not on the live-call-trial event', v_host;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.booking_event_hosts
    WHERE event_type_id = v_fi AND host_user_id = v_host
  ) THEN
    RAISE EXCEPTION 'per-event seed: host % is not on the final-interview event', v_host;
  END IF;

  -- Reset his DEFAULT (event_type_id IS NULL) rules to Mon–Fri 09:00–17:00.
  -- They were half-edited by hand on the morning of 2026-08-25 (Mon
  -- 17:45–19:00, Tue–Fri 17:45–22:00) in an attempt to express the per-event
  -- hours before the schema supported them — those rows would otherwise
  -- become the fallback for every OTHER event he hosts. Runs before the
  -- inherit step below so the overrides pick up the sane baseline settings.
  DELETE FROM public.booking_availability_rules
  WHERE host_user_id = v_host AND event_type_id IS NULL;

  INSERT INTO public.booking_availability_rules
    (host_user_id, event_type_id, weekday, start_time, end_time,
     timezone, buffer_minutes, min_notice_minutes, daily_cap)
  SELECT v_host, NULL, w, '09:00'::time, '17:00'::time,
         'Europe/London', 0, 120, NULL
  FROM generate_series(1, 5) AS w;

  -- Inherit timezone/buffer/notice/cap from his default rules when present.
  SELECT r.timezone, r.buffer_minutes, r.min_notice_minutes, r.daily_cap
    INTO v_tz, v_buffer, v_notice, v_cap
  FROM public.booking_availability_rules r
  WHERE r.host_user_id = v_host AND r.event_type_id IS NULL
  ORDER BY r.weekday
  LIMIT 1;
  v_tz     := COALESCE(v_tz, 'Europe/London');
  v_buffer := COALESCE(v_buffer, 15);
  v_notice := COALESCE(v_notice, 240);

  DELETE FROM public.booking_availability_rules
  WHERE host_user_id = v_host AND event_type_id IN (v_lct, v_fi);

  -- Live Call Trial: Mon–Fri 17:45–19:00
  INSERT INTO public.booking_availability_rules
    (host_user_id, event_type_id, weekday, start_time, end_time,
     timezone, buffer_minutes, min_notice_minutes, daily_cap)
  SELECT v_host, v_lct, w, '17:45'::time, '19:00'::time,
         v_tz, v_buffer, v_notice, v_cap
  FROM generate_series(1, 5) AS w;

  -- Final Interview: Mon–Fri 09:00–17:00 (explicit, so later default-hour
  -- changes cannot move final interviews)
  INSERT INTO public.booking_availability_rules
    (host_user_id, event_type_id, weekday, start_time, end_time,
     timezone, buffer_minutes, min_notice_minutes, daily_cap)
  SELECT v_host, v_fi, w, '09:00'::time, '17:00'::time,
         v_tz, v_buffer, v_notice, v_cap
  FROM generate_series(1, 5) AS w;

  RAISE NOTICE 'seeded per-event hours for host % (LCT %, FI %)', v_host, v_lct, v_fi;
END $$;
