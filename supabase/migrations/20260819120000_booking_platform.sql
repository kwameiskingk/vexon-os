-- Vexon OS Bookings · Batch 1 schema — Calendly replacement, acquisition side first
-- (green-lit 2026-08-19). Six tables + RLS. Client-side writes are restricted to
-- admin/dev; the booking lifecycle itself (holds, confirms, Google Calendar,
-- notifications) runs through service-role edge functions in Batch 2+, so
-- bookings/booking_notifications intentionally have NO authenticated write
-- policies. Apply via the hosted builder SQL editor (migration bookkeeping unaware — never
-- `supabase db push`; add to repair list: 20260819120000).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── event types ──────────────────────────────────────────────────────────────
CREATE TABLE public.booking_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  duration_minutes int NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 480),
  -- ordered array of {id, label, type: short_text|long_text|yes_no|dropdown, required, options[]}
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  redirect_url text,
  location_type text NOT NULL DEFAULT 'google_meet'
    CHECK (location_type IN ('google_meet', 'phone', 'in_person')),
  side text NOT NULL DEFAULT 'acquisition' CHECK (side IN ('acquisition', 'fulfilment')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER booking_event_types_updated_at
  BEFORE UPDATE ON public.booking_event_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── hosts per event type ─────────────────────────────────────────────────────
CREATE TABLE public.booking_event_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_id uuid NOT NULL REFERENCES public.booking_event_types(id) ON DELETE CASCADE,
  host_user_id uuid NOT NULL,
  host_calendar_email text NOT NULL,
  priority int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_type_id, host_user_id)
);

-- ── weekly availability per host ─────────────────────────────────────────────
-- One row per host per weekday (0=Sunday … 6=Saturday, matching JS getDay()).
-- buffer/min-notice/daily-cap are per-row so a host can differ by day; the
-- Dev Center editor writes the same value across all a host's rows.
CREATE TABLE public.booking_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  timezone text NOT NULL DEFAULT 'Europe/London',
  buffer_minutes int NOT NULL DEFAULT 0 CHECK (buffer_minutes BETWEEN 0 AND 120),
  min_notice_minutes int NOT NULL DEFAULT 240 CHECK (min_notice_minutes >= 0),
  daily_cap int CHECK (daily_cap > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (host_user_id, weekday, start_time)
);

-- ── bookings ─────────────────────────────────────────────────────────────────
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_id uuid NOT NULL REFERENCES public.booking_event_types(id),
  host_user_id uuid NOT NULL,
  meeting_id uuid REFERENCES public.meetings(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'confirmed', 'cancelled', 'rescheduled', 'completed')),
  hold_expires_at timestamptz,
  source text NOT NULL DEFAULT 'setter' CHECK (source IN ('setter', 'public', 'admin')),
  prospect_name text,
  prospect_email text,
  prospect_mobile text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  prospect_timezone text,
  google_event_id text,
  google_meet_link text,
  cancelled_reason text,
  rebooked_from_id uuid REFERENCES public.bookings(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The double-booking lock: Postgres itself refuses two held/confirmed bookings
-- for the same host with overlapping times — regardless of any race in code.
ALTER TABLE public.bookings ADD CONSTRAINT bookings_no_double_booking
  EXCLUDE USING gist (
    host_user_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('held', 'confirmed'));

CREATE INDEX bookings_host_time_idx ON public.bookings (host_user_id, starts_at);
CREATE INDEX bookings_event_type_idx ON public.bookings (event_type_id, created_at DESC);

-- ── outbound notification log (email + SMS) ──────────────────────────────────
CREATE TABLE public.booking_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  template text NOT NULL,
  recipient text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'cancelled')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_notifications_due_idx
  ON public.booking_notifications (status, scheduled_for);

-- ── calendar connections ─────────────────────────────────────────────────────
CREATE TABLE public.calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('workspace', 'client')),
  client_profile_id uuid REFERENCES public.client_profiles(id),
  calendar_email text NOT NULL,
  provider text NOT NULL DEFAULT 'google',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'error', 'disconnected')),
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── security ─────────────────────────────────────────────────────────────────
ALTER TABLE public.booking_event_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_event_hosts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_connections       ENABLE ROW LEVEL SECURITY;

-- anon never touches booking tables directly; the public booking page (Batch 3)
-- goes through a verify_jwt=false edge function using the service role.
REVOKE ALL
  ON public.booking_event_types, public.booking_event_hosts,
     public.booking_availability_rules, public.bookings,
     public.booking_notifications, public.calendar_connections
  FROM anon;

-- Config tables: every signed-in staff member may read (setters need event
-- types + availability to book); only admin/dev manage.
CREATE POLICY "Authenticated read booking_event_types"
  ON public.booking_event_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin tier manages booking_event_types"
  ON public.booking_event_types FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  );

CREATE POLICY "Authenticated read booking_event_hosts"
  ON public.booking_event_hosts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin tier manages booking_event_hosts"
  ON public.booking_event_hosts FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  );

CREATE POLICY "Authenticated read booking_availability_rules"
  ON public.booking_availability_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin tier manages booking_availability_rules"
  ON public.booking_availability_rules FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  );

-- Bookings: admin/dev/ops see all; the setter who created one and the host of
-- one see their own. No authenticated INSERT/UPDATE — lifecycle is
-- service-role-only via edge functions (holds, Google Calendar, notifications).
CREATE POLICY "Admin tier and involved users read bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
    OR created_by = auth.uid()
    OR host_user_id = auth.uid()
  );

CREATE POLICY "Admin tier reads booking_notifications"
  ON public.booking_notifications FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  );

CREATE POLICY "Admin tier reads calendar_connections"
  ON public.calendar_connections FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  );
CREATE POLICY "Admin tier manages calendar_connections"
  ON public.calendar_connections FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  );
