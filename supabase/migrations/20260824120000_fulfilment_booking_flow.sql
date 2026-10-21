-- Fulfilment booking flow (Marcus 21 Aug, the owner's rulings 24 Aug 2026).
-- APPLIED TO PROD 2026-08-24 in three parts: part A+B pasted by the owner,
-- parts C+D applied via the the hosted builder SQL runner during the build.
-- Idempotent: every block guards itself.

-- A. meetings: the new qualification answers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='meetings'
      AND column_name='open_to_receiving_cvs'
  ) THEN
    RAISE NOTICE 'fulfilment overhaul columns already present — skipping A+B';
    RETURN;
  END IF;

  ALTER TABLE public.meetings
    ADD COLUMN open_to_receiving_cvs boolean,
    ADD COLUMN cv_candidate_titles text,
    ADD COLUMN cv_candidate_level text,
    ADD COLUMN other_decision_makers boolean,
    ADD COLUMN decision_maker_email text,
    ADD COLUMN decision_maker_status text
      CHECK (decision_maker_status IN ('joining','briefed_by_prospect','email_pending'));

  -- B. booking platform: client events + external (client) hosts
  ALTER TABLE public.booking_event_types
    ADD COLUMN client_id uuid REFERENCES public.client_profiles(id) ON DELETE SET NULL;

  ALTER TABLE public.booking_event_hosts
    ALTER COLUMN host_user_id DROP NOT NULL,
    ADD COLUMN client_profile_id uuid REFERENCES public.client_profiles(id) ON DELETE CASCADE,
    ADD COLUMN external_email text,
    ADD COLUMN external_name text,
    ADD CONSTRAINT booking_event_hosts_one_identity
      CHECK ((host_user_id IS NOT NULL)::int + (client_profile_id IS NOT NULL)::int = 1);

  ALTER TABLE public.booking_availability_rules
    ALTER COLUMN host_user_id DROP NOT NULL,
    ADD COLUMN client_profile_id uuid REFERENCES public.client_profiles(id) ON DELETE CASCADE,
    ADD CONSTRAINT booking_availability_rules_one_identity
      CHECK ((host_user_id IS NOT NULL)::int + (client_profile_id IS NOT NULL)::int = 1);

  ALTER TABLE public.bookings
    ALTER COLUMN host_user_id DROP NOT NULL,
    ADD COLUMN client_profile_id uuid REFERENCES public.client_profiles(id) ON DELETE SET NULL;
END $$;

-- C. Double-booking shield for client-hosted bookings. The original
-- exclusion constraint keys on host_user_id, and NULLs never collide in a
-- GiST equality — so client bookings need their own twin (flagged in the
-- approved design).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bookings_no_double_booking_client') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_no_double_booking_client
      EXCLUDE USING gist (client_profile_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
      WHERE (status IN ('held','confirmed') AND client_profile_id IS NOT NULL);
  END IF;
END $$;

-- D. calendar_connections: the connect-link token and the client's Google
-- OAuth grant (Tier 2). Additive, nullable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='calendar_connections' AND column_name='connect_token'
  ) THEN
    ALTER TABLE public.calendar_connections
      ADD COLUMN connect_token text UNIQUE,
      ADD COLUMN invited_at timestamptz,
      ADD COLUMN connected_at timestamptz,
      ADD COLUMN google_refresh_token text,
      ADD COLUMN google_access_token text,
      ADD COLUMN token_expires_at timestamptz;
  END IF;
END $$;

-- E. Widen the connection status check to include 'invited' (the connect
-- email sets it; original batch-1 check predated the connect flow).
-- APPLIED TO PROD 2026-08-24 during the connect end-to-end test.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='calendar_connections_status_check'
      AND pg_get_constraintdef(oid) LIKE '%invited%'
  ) THEN
    ALTER TABLE public.calendar_connections DROP CONSTRAINT calendar_connections_status_check;
    ALTER TABLE public.calendar_connections ADD CONSTRAINT calendar_connections_status_check
      CHECK (status = ANY (ARRAY['pending','invited','connected','error','disconnected']));
  END IF;
END $$;

-- F. Client hosts have no Workspace calendar — host_calendar_email must be
-- nullable (external_email carries the client's address instead).
-- APPLIED TO PROD 2026-08-24 during the connect end-to-end test.
DO $$
BEGIN
  ALTER TABLE public.booking_event_hosts ALTER COLUMN host_calendar_email DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
