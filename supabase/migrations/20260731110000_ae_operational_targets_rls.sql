-- AE operational-targets RLS: additive sdr_manager arm (Phase 2, 2026-07-31).
--
-- NOT applied by the assistant — the owner previews and applies.
--
-- Lets the AE-bench manager (today: Felix, the acquisition SDR manager)
-- write the four OPERATIONAL AE targets (deals_closed, cold_calls,
-- talk_minutes, reengaged_meetings) in individual_targets — and explicitly
-- NOT cash_collected, which is owned end-to-end by the CEO Goals →
-- individual_targets sync (20260731090000). admin/dev/ops keep their
-- existing unrestricted write via "Target managers can write individual
-- targets" (20260722200000) — that policy is untouched; policies are
-- permissive, so this only ADDS permission.
--
-- Scoping reuses the two helpers created for AE attendance (20260729120000):
--   sdr_manager_manages_aes(_user)  — true only for managers whose
--     sdr_manager_departments() include 'acquisition' (Felix yes,
--     fulfilment managers e.g. Nadia no);
--   is_active_genuine_ae(_user_id)  — subject must be an active, non-test
--     setters_profiles row in department 'sales' holding the
--     account_executive role. AE individual_targets rows key
--     subject_profile_id on profiles.id (= auth user id), which is exactly
--     the argument this helper takes.

DROP POLICY IF EXISTS "SDR manager writes managed AE operational targets"
  ON public.individual_targets;
CREATE POLICY "SDR manager writes managed AE operational targets"
  ON public.individual_targets FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'sdr_manager'::app_role)
    AND public.sdr_manager_manages_aes(auth.uid())
    AND role = 'account_executive'
    AND metric <> 'cash_collected'
    AND public.is_active_genuine_ae(subject_profile_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'sdr_manager'::app_role)
    AND public.sdr_manager_manages_aes(auth.uid())
    AND role = 'account_executive'
    AND metric <> 'cash_collected'
    AND public.is_active_genuine_ae(subject_profile_id)
  );
