-- Stage 2: manual overrides for client-health tile metrics.
-- One row per (client, metric): presence of a row IS the override (no mode
-- toggle), mirroring the presence-= -intent convention of the fulfilment
-- targets resolver (resolveTargets.ts). Deleting the row reverts the tile to
-- its computed value. The health tile row is all-time, so there is no period
-- column. Show-up Rate is never stored here — it derives from the resolved
-- booked/sat values. Avg Quality, Quality (4+) and App Quality are
-- deliberately absent from the metric list: they are not overridable.

CREATE TABLE IF NOT EXISTS public.client_health_metric_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN (
    'meetings_booked', 'meetings_sat', 'revenue',
    'opportunities', 'vacancies', 'days_remaining'
  )),
  value numeric NOT NULL,
  -- The save-time answer to "Does this affect client health scoring?".
  -- true  = the health band + rationale recompute using this value
  -- false = display only; band + rationale keep using source data
  affects_health boolean NOT NULL DEFAULT false,
  set_by uuid NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_profile_id, metric)
);

COMMENT ON TABLE public.client_health_metric_overrides IS
  'Manual per-metric overrides for the client health tile row. A row existing is the override; deletion reverts to computed. Never mutates source data (meetings, catchups, payments).';
COMMENT ON COLUMN public.client_health_metric_overrides.affects_health IS
  'Save-time choice: true = health band/rationale recompute from this value (can flip the band, including on the CEO board); false = display only.';
COMMENT ON COLUMN public.client_health_metric_overrides.set_by IS
  'auth.users id of who set or last changed this override.';
COMMENT ON COLUMN public.client_health_metric_overrides.set_at IS
  'When this override was set or last changed; drives the 30-day staleness marker. Never auto-expired.';

CREATE INDEX IF NOT EXISTS idx_chmo_client
  ON public.client_health_metric_overrides (client_profile_id);

ALTER TABLE public.client_health_metric_overrides ENABLE ROW LEVEL SECURITY;

-- csm / admin / ops / dev read and write; client-portal and all other roles
-- have no access. Same per-verb has_role shape as client_stipulations
-- (migration 20260520155630).
DROP POLICY IF EXISTS "Staff can view health metric overrides" ON public.client_health_metric_overrides;
CREATE POLICY "Staff can view health metric overrides"
  ON public.client_health_metric_overrides FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
  );

DROP POLICY IF EXISTS "Staff can insert health metric overrides" ON public.client_health_metric_overrides;
CREATE POLICY "Staff can insert health metric overrides"
  ON public.client_health_metric_overrides FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
  );

DROP POLICY IF EXISTS "Staff can update health metric overrides" ON public.client_health_metric_overrides;
CREATE POLICY "Staff can update health metric overrides"
  ON public.client_health_metric_overrides FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
  );

DROP POLICY IF EXISTS "Staff can delete health metric overrides" ON public.client_health_metric_overrides;
CREATE POLICY "Staff can delete health metric overrides"
  ON public.client_health_metric_overrides FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
  );

-- ---------------------------------------------------------------------------
-- Append-only history. Every set / change / clear of an override is recorded
-- by trigger, so what the tiles (and the CEO board, when affects_health) were
-- showing at any point in the past stays reconstructable. No FK to the
-- override row: history must outlive the override it describes.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_health_metric_override_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  metric text NOT NULL,
  action text NOT NULL CHECK (action IN ('set', 'updated', 'cleared')),
  -- For 'set'/'updated' this is the new value; for 'cleared' it is the value
  -- that was removed. Same for affects_health.
  value numeric,
  affects_health boolean,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_health_metric_override_history IS
  'Append-only audit of client_health_metric_overrides, written by trigger. Rows are never updated or deleted by the app.';

CREATE INDEX IF NOT EXISTS idx_chmo_history_client
  ON public.client_health_metric_override_history (client_profile_id, metric, performed_at);

CREATE OR REPLACE FUNCTION public.log_client_health_metric_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.client_health_metric_override_history
      (client_profile_id, metric, action, value, affects_health, performed_by)
    VALUES (NEW.client_profile_id, NEW.metric, 'set', NEW.value, NEW.affects_health, COALESCE(auth.uid(), NEW.set_by));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only record real changes; ignore no-op writes.
    IF NEW.value IS DISTINCT FROM OLD.value
       OR NEW.affects_health IS DISTINCT FROM OLD.affects_health THEN
      INSERT INTO public.client_health_metric_override_history
        (client_profile_id, metric, action, value, affects_health, performed_by)
      VALUES (NEW.client_profile_id, NEW.metric, 'updated', NEW.value, NEW.affects_health, COALESCE(auth.uid(), NEW.set_by));
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.client_health_metric_override_history
      (client_profile_id, metric, action, value, affects_health, performed_by)
    VALUES (OLD.client_profile_id, OLD.metric, 'cleared', OLD.value, OLD.affects_health, auth.uid());
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_client_health_metric_override ON public.client_health_metric_overrides;
CREATE TRIGGER trg_log_client_health_metric_override
AFTER INSERT OR UPDATE OR DELETE ON public.client_health_metric_overrides
FOR EACH ROW
EXECUTE FUNCTION public.log_client_health_metric_override();

ALTER TABLE public.client_health_metric_override_history ENABLE ROW LEVEL SECURITY;

-- Read-only for the same four roles; no INSERT/UPDATE/DELETE policies exist,
-- so the app cannot write or rewrite history — only the SECURITY DEFINER
-- trigger function appends.
DROP POLICY IF EXISTS "Staff can view health metric override history" ON public.client_health_metric_override_history;
CREATE POLICY "Staff can view health metric override history"
  ON public.client_health_metric_override_history FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
  );
