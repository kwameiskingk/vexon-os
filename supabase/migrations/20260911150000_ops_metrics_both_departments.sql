-- Ops Command metrics for both departments, 11 Sep 2026 (Elena, morning call).
--
-- Elena (role ops) is taking over the daily metrics entry for the
-- fulfilment setters as well as the acquisition ones. The two ops policies
-- from 17 Jul allowed acquisition rows only; they are replaced by policies
-- covering both departments. Own entries only, as before.
--
-- Safe to run twice. Applied by the owner via the hosted SQL editor.

DROP POLICY IF EXISTS "Ops can insert acquisition manual_daily_metrics" ON public.manual_daily_metrics;
DROP POLICY IF EXISTS "Ops can update acquisition manual_daily_metrics" ON public.manual_daily_metrics;
DROP POLICY IF EXISTS "Ops can insert setter manual_daily_metrics" ON public.manual_daily_metrics;
DROP POLICY IF EXISTS "Ops can update setter manual_daily_metrics" ON public.manual_daily_metrics;

CREATE POLICY "Ops can insert setter manual_daily_metrics"
  ON public.manual_daily_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'ops'::public.app_role)
    AND department IN ('acquisition'::public.metrics_department, 'fulfilment'::public.metrics_department)
    AND entered_by = auth.uid()
  );

CREATE POLICY "Ops can update setter manual_daily_metrics"
  ON public.manual_daily_metrics
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'ops'::public.app_role)
    AND department IN ('acquisition'::public.metrics_department, 'fulfilment'::public.metrics_department)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'ops'::public.app_role)
    AND department IN ('acquisition'::public.metrics_department, 'fulfilment'::public.metrics_department)
    AND entered_by = auth.uid()
  );
