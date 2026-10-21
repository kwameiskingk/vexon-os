-- Setter review metric overrides — Elena's ask, 8 Sep 2026 (Core Team call
-- 14:13 "add editable fields to performance review dashboard").
-- One row per setter per calendar month. A NULL column = no override for that
-- metric (0 is a real override). Presence of a value wins over the computed
-- figure ONLY on the Performance Review surface (compiled_metrics + team
-- table); leaderboards, RAG board, CEO tiles and Morning Meeting are untouched.
-- Show rate re-derives as sat ÷ booked from the resolved values; it is never
-- stored. Permissions mirror setter_period_notes / performance_reviews:
-- admin/dev/ops full, sdr_manager department-scoped, setter role NO policy.
-- NOTE: applied via the hosted builder SQL editor; safe to run twice.
--       Never `supabase db push` this file.

CREATE TABLE IF NOT EXISTS public.setter_review_metric_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_profile_id uuid NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  period_month date NOT NULL CHECK (EXTRACT(DAY FROM period_month) = 1),
  meetings_booked integer CHECK (meetings_booked IS NULL OR meetings_booked >= 0),
  meetings_sat integer CHECK (meetings_sat IS NULL OR meetings_sat >= 0),
  warm_leads integer CHECK (warm_leads IS NULL OR warm_leads >= 0),
  reason text,
  set_by uuid NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (setter_profile_id, period_month)
);

ALTER TABLE public.setter_review_metric_overrides ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_setter_review_metric_overrides_updated_at ON public.setter_review_metric_overrides;
CREATE TRIGGER set_setter_review_metric_overrides_updated_at
  BEFORE UPDATE ON public.setter_review_metric_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Admin tier manages setter review overrides" ON public.setter_review_metric_overrides;
CREATE POLICY "Admin tier manages setter review overrides"
  ON public.setter_review_metric_overrides
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'ops'::public.app_role)
  );

DROP POLICY IF EXISTS "SDR manager reads managed-department review overrides" ON public.setter_review_metric_overrides;
CREATE POLICY "SDR manager reads managed-department review overrides"
  ON public.setter_review_metric_overrides
  FOR SELECT
  TO authenticated
  USING (
    public.has_sdr_manager_role(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.setters_profiles sp
      WHERE sp.id = setter_profile_id
        AND sp.department = ANY (public.sdr_manager_departments(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "SDR manager writes managed-department review overrides" ON public.setter_review_metric_overrides;
CREATE POLICY "SDR manager writes managed-department review overrides"
  ON public.setter_review_metric_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_sdr_manager_role(auth.uid())
    AND set_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.setters_profiles sp
      WHERE sp.id = setter_profile_id
        AND sp.department = ANY (public.sdr_manager_departments(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "SDR manager updates managed-department review overrides" ON public.setter_review_metric_overrides;
CREATE POLICY "SDR manager updates managed-department review overrides"
  ON public.setter_review_metric_overrides
  FOR UPDATE
  TO authenticated
  USING (
    public.has_sdr_manager_role(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.setters_profiles sp
      WHERE sp.id = setter_profile_id
        AND sp.department = ANY (public.sdr_manager_departments(auth.uid()))
    )
  )
  WITH CHECK (
    public.has_sdr_manager_role(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.setters_profiles sp
      WHERE sp.id = setter_profile_id
        AND sp.department = ANY (public.sdr_manager_departments(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "SDR manager deletes managed-department review overrides" ON public.setter_review_metric_overrides;
CREATE POLICY "SDR manager deletes managed-department review overrides"
  ON public.setter_review_metric_overrides
  FOR DELETE
  TO authenticated
  USING (
    public.has_sdr_manager_role(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.setters_profiles sp
      WHERE sp.id = setter_profile_id
        AND sp.department = ANY (public.sdr_manager_departments(auth.uid()))
    )
  );

-- The setter role deliberately has NO policy on this table (reviews rule).
notify pgrst, 'reload schema';
