-- SECURITY: lock down the 7 Jan–Jun 2026 historical-backfill staging tables —
-- approved 2026-07-29 (pre-publish scan finding: RLS disabled, zero policies,
-- while anon + authenticated held FULL default grants — any holder of the
-- publishable anon key could read AND write these via the API since the
-- backfill project). Audit findings: exactly these 7 tables are RLS-off in
-- public (nothing else); no live code path reads them (only the generated
-- types.ts mentions them — the CEO surfaces read the consolidated live
-- tables); contents are historical business data (48 clients, 343 meetings,
-- 1,107 telemetry rows, etc.).
-- Lockdown: RLS on, admin/dev/ops SELECT-only, API write privileges revoked
-- (defense in depth — RLS does not govern TRUNCATE, and nothing writes these
-- from the client). service_role is unaffected, so any future backfill
-- re-run via SQL editor / edge functions still works.
-- NOTE: to be applied via the hosted builder SQL editor; migration bookkeeping unaware.
--       Never `supabase db push` this file. Add to the repair list:
--       supabase migration repair --status applied 20260729180000

ALTER TABLE public.backfill_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_discovery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_pitch_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_sales_discovery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_ae_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_setter_telemetry ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.backfill_clients, public.backfill_discovery_logs,
     public.backfill_meetings, public.backfill_pitch_calls,
     public.backfill_sales_discovery_logs, public.backfill_ae_deals,
     public.backfill_setter_telemetry
  FROM anon, authenticated;

REVOKE SELECT
  ON public.backfill_clients, public.backfill_discovery_logs,
     public.backfill_meetings, public.backfill_pitch_calls,
     public.backfill_sales_discovery_logs, public.backfill_ae_deals,
     public.backfill_setter_telemetry
  FROM anon;

CREATE POLICY "Admin tier reads backfill_clients (historical)"
  ON public.backfill_clients FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  );

CREATE POLICY "Admin tier reads backfill_discovery_logs (historical)"
  ON public.backfill_discovery_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  );

CREATE POLICY "Admin tier reads backfill_meetings (historical)"
  ON public.backfill_meetings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  );

CREATE POLICY "Admin tier reads backfill_pitch_calls (historical)"
  ON public.backfill_pitch_calls FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  );

CREATE POLICY "Admin tier reads backfill_sales_discovery_logs (historical)"
  ON public.backfill_sales_discovery_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  );

CREATE POLICY "Admin tier reads backfill_ae_deals (historical)"
  ON public.backfill_ae_deals FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  );

CREATE POLICY "Admin tier reads backfill_setter_telemetry (historical)"
  ON public.backfill_setter_telemetry FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  );
