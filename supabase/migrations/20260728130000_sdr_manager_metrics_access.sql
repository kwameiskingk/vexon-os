-- SDR Manager metrics input access (Felix, acquisition) — approved 2026-07-28
-- Department-scoped read/write on manual_daily_metrics for sdr_manager role,
-- via sdr_manager_departments(auth.uid()) (empty array -> fail-closed).
-- Access is deliberately department-wide, not per-assigned-setter (the owner's
-- ruling 2026-07-28: an SDR manager manages their entire department until
-- scaling requires narrower assignment).
-- NOTE the (department)::text cast — department is metrics_department (enum),
-- sdr_manager_departments() returns text[]; without the cast the policy fails
-- with an operator type error.
-- NOTE: applied manually via SQL Editor 2026-07-28; migration bookkeeping unaware.
--       Never `supabase db push` this file. Add to the repair list:
--       supabase migration repair --status applied 20260728130000
-- (Version is 130000, not the 120000 originally drafted — 20260728120000 was
--  already taken by ae_title_and_name_fix.)

CREATE POLICY "sdr_manager_select_metrics"
  ON public.manual_daily_metrics
  FOR SELECT
  TO authenticated
  USING (
    public.has_sdr_manager_role(auth.uid())
    AND department::text = ANY (public.sdr_manager_departments(auth.uid()))
  );

CREATE POLICY "sdr_manager_insert_metrics"
  ON public.manual_daily_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_sdr_manager_role(auth.uid())
    AND department::text = ANY (public.sdr_manager_departments(auth.uid()))
    AND entered_by = auth.uid()
  );

CREATE POLICY "sdr_manager_update_metrics"
  ON public.manual_daily_metrics
  FOR UPDATE
  TO authenticated
  USING (
    public.has_sdr_manager_role(auth.uid())
    AND department::text = ANY (public.sdr_manager_departments(auth.uid()))
  )
  WITH CHECK (
    public.has_sdr_manager_role(auth.uid())
    AND department::text = ANY (public.sdr_manager_departments(auth.uid()))
  );

-- Pre-existing (unchanged here): the combined "Authorized roles can read
-- manual_daily_metrics" SELECT policy still carries the old fulfilment-
-- hardcoded sdr_manager branch — now redundant with sdr_manager_select_metrics;
-- remove whenever that policy is next touched.
