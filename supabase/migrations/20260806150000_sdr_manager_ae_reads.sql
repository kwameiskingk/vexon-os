-- SDR-manager AE visibility: SELECT-only reads on the acquisition pipeline
-- (2026-08-06 session-1 ruling). NO write policies anywhere in this file.
-- ae_compensation deliberately receives NO policy — compensation stays
-- hidden from sdr_manager permanently (the owner ruling 2026-08-06).
-- Gating reuses the PR #84 helpers: sdr_manager_manages_aes (true only for
-- managers whose assignments include acquisition) and is_active_genuine_ae
-- (sales-dept, active, non-test, account_executive role).
--
-- Proven by rolled-back impersonation before apply (16/16: Felix scoped
-- reads incl. comp=0 rows and write denials; Nadia 0 rows everywhere;
-- setter unaffected). Applied via the hosted SQL editor 2026-08-06 and
-- verified live in pg_policies; migration bookkeeping unaware. Never
-- `supabase db push` this file. Repair list:
--   supabase migration repair --status applied 20260806150000

-- Discovery logs attribute to AEs only through meetings.meeting_id, and the
-- AE pipeline view includes the not-yet-assigned pool, so the visibility rule
-- is "acquisition pipeline meeting": department acquisition (any casing) and
-- assigned to an active genuine AE or unassigned.
CREATE OR REPLACE FUNCTION public.is_acquisition_pipeline_meeting(_meeting_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = _meeting_id
      AND lower(m.department) = 'acquisition'
      AND (m.assigned_ae_id IS NULL OR public.is_active_genuine_ae(m.assigned_ae_id))
  );
$$;

CREATE POLICY "SDR managers view managed AE meetings"
ON public.meetings FOR SELECT TO authenticated
USING (
  has_sdr_manager_role(auth.uid())
  AND sdr_manager_manages_aes(auth.uid())
  AND assigned_ae_id IS NOT NULL
  AND is_active_genuine_ae(assigned_ae_id)
);

CREATE POLICY "SDR managers view managed AE pitch calls"
ON public.pitch_calls FOR SELECT TO authenticated
USING (
  has_sdr_manager_role(auth.uid())
  AND sdr_manager_manages_aes(auth.uid())
  AND is_active_genuine_ae(created_by)
);

CREATE POLICY "SDR managers view acquisition discovery logs"
ON public.sales_discovery_logs FOR SELECT TO authenticated
USING (
  has_sdr_manager_role(auth.uid())
  AND sdr_manager_manages_aes(auth.uid())
  AND public.is_acquisition_pipeline_meeting(meeting_id)
);

CREATE POLICY "SDR managers view managed AE deal payments"
ON public.ae_deal_payments FOR SELECT TO authenticated
USING (
  has_sdr_manager_role(auth.uid())
  AND sdr_manager_manages_aes(auth.uid())
  AND is_active_genuine_ae(ae_user_id)
);

CREATE POLICY "SDR managers view managed AE metrics overrides"
ON public.ae_metrics_overrides FOR SELECT TO authenticated
USING (
  has_sdr_manager_role(auth.uid())
  AND sdr_manager_manages_aes(auth.uid())
  AND is_active_genuine_ae(ae_user_id)
);
