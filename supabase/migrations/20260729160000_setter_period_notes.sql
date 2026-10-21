-- Setter period notes — approved 2026-07-29 (Workstream B: table view +
-- monthly team review; replaces the Notes column of Nadia's Excel sheet).
-- One row per setter per calendar month; the following month renders the
-- prior month's note read-only beside the new numbers ("Notes from June PR"
-- carry-forward). No existing table fits: performance_reviews has no text
-- column and its jsonb is machine-overwritten on regenerate; performance_goals
-- is numeric-only; coaching_sessions is an event log whose counts feed
-- reviews. Permissions mirror the reviews precedent (admin/dev/ops full,
-- sdr_manager department-scoped, setter role deliberately has NO policy).
-- NOTE: to be applied via the hosted builder SQL editor; migration bookkeeping unaware.
--       Never `supabase db push` this file. Add to the repair list:
--       supabase migration repair --status applied 20260729160000

CREATE TABLE public.setter_period_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_profile_id uuid NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  period_month date NOT NULL CHECK (EXTRACT(DAY FROM period_month) = 1),
  note text NOT NULL DEFAULT '',
  author_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (setter_profile_id, period_month)
);

ALTER TABLE public.setter_period_notes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_setter_period_notes_updated_at
  BEFORE UPDATE ON public.setter_period_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admin tier manages setter period notes"
  ON public.setter_period_notes
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

CREATE POLICY "SDR manager reads managed-department period notes"
  ON public.setter_period_notes
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

CREATE POLICY "SDR manager writes managed-department period notes"
  ON public.setter_period_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_sdr_manager_role(auth.uid())
    AND author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.setters_profiles sp
      WHERE sp.id = setter_profile_id
        AND sp.department = ANY (public.sdr_manager_departments(auth.uid()))
    )
  );

CREATE POLICY "SDR manager updates managed-department period notes"
  ON public.setter_period_notes
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

-- The setter role deliberately has NO policy on this table (reviews rule).
