
-- 1. Tighten overly-permissive RLS policies

-- Service role manage candidate_assessments (was true/true with no TO)
DROP POLICY IF EXISTS "Service role can manage candidate assessments" ON public.candidate_assessments;
CREATE POLICY "Service role can manage candidate assessments"
  ON public.candidate_assessments AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- System insert audit logs - restrict to service_role
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert audit logs" ON public.invoice_audit_log;
CREATE POLICY "System can insert audit logs"
  ON public.invoice_audit_log FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.onboarding_webhook_audit_log;
CREATE POLICY "Service role can insert audit logs"
  ON public.onboarding_webhook_audit_log FOR INSERT TO service_role WITH CHECK (true);

-- Restrict authenticated-only policies with TO authenticated (they were public role)
DROP POLICY IF EXISTS "Authenticated users can insert metric entries" ON public.client_metric_entries;
CREATE POLICY "Authenticated users can insert metric entries"
  ON public.client_metric_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete metric entries" ON public.client_metric_entries;
CREATE POLICY "Authenticated users can delete metric entries"
  ON public.client_metric_entries FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert client catchups" ON public.client_catchups;
CREATE POLICY "Authenticated users can insert client catchups"
  ON public.client_catchups FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update client catchups" ON public.client_catchups;
CREATE POLICY "Authenticated users can update client catchups"
  ON public.client_catchups FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete client catchups" ON public.client_catchups;
CREATE POLICY "Authenticated users can delete client catchups"
  ON public.client_catchups FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- 2. Restrict leaderboard_achievements public SELECT to authenticated users
DROP POLICY IF EXISTS "Everyone can view achievements" ON public.leaderboard_achievements;
DROP POLICY IF EXISTS "Everyone can view leaderboard_achievements" ON public.leaderboard_achievements;
CREATE POLICY "Authenticated users can view leaderboard_achievements"
  ON public.leaderboard_achievements FOR SELECT TO authenticated USING (true);

-- 3. Fix mutable function search_path
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.set_invoice_number() SET search_path = public;
