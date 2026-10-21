-- ============================================================
-- Batch 3 — HR interview capture + campaign renewal notifications
-- Applied manually via the Supabase SQL Editor on 2026-07-20 (CLI
-- link blocked on account permissions — do NOT `supabase db push`;
-- repair history instead when CLI access works).
-- Safe to re-run: all statements guarded.
-- ============================================================

-- ---------- A2: interviews table (BUILD 5 log-interview capture) ----------
CREATE TABLE IF NOT EXISTS public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  interview_type text NOT NULL
    CHECK (interview_type IN ('ceo_trial_call', 'sdr_manager', 'other')),
  interview_date date NOT NULL,
  interview_time time,
  outcome text NOT NULL DEFAULT 'scheduled'
    CHECK (outcome IN ('scheduled', 'completed', 'no_show', 'cancelled')),
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interviews_candidate ON public.interviews(candidate_id);

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_interviews_updated_at ON public.interviews;
CREATE TRIGGER update_interviews_updated_at
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Admins manage interviews" ON public.interviews;
CREATE POLICY "Admins manage interviews" ON public.interviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "SDR manager manages interviews" ON public.interviews;
CREATE POLICY "SDR manager manages interviews" ON public.interviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'sdr_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'sdr_manager'));

DROP POLICY IF EXISTS "Ops command manages interviews" ON public.interviews;
CREATE POLICY "Ops command manages interviews" ON public.interviews
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ops_command'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ops_command'));

-- ---------- A4: let the Ops Command operator (Elena) run the pipeline ----------
-- candidates RLS today: admin FOR ALL + sdr_manager SELECT/UPDATE only.
DROP POLICY IF EXISTS "Ops command manages candidates" ON public.candidates;
CREATE POLICY "Ops command manages candidates" ON public.candidates
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ops_command'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ops_command'));

-- CV bucket is admin-only today (20251111085447); mirror the capability grant.
DROP POLICY IF EXISTS "Ops command manages candidate CVs" ON storage.objects;
CREATE POLICY "Ops command manages candidate CVs" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'candidate-cvs'
         AND public.has_capability(auth.uid(), 'can_view_ops_command'))
  WITH CHECK (bucket_id = 'candidate-cvs'
              AND public.has_capability(auth.uid(), 'can_view_ops_command'));

-- ---------- B: campaign renewal notification flags + reset trigger ----------
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS renewal_notified_30d boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewal_notified_14d boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewal_notified_7d  boolean NOT NULL DEFAULT false;

-- Same precedent as the 'achievement' value (20260120155745). The new value
-- is never used inside this migration, so it is transaction-safe.
ALTER TYPE public.notification_category ADD VALUE IF NOT EXISTS 'renewal';

CREATE OR REPLACE FUNCTION public.reset_campaign_renewal_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    NEW.renewal_notified_30d := false;
    NEW.renewal_notified_14d := false;
    NEW.renewal_notified_7d  := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_campaign_renewal_flags ON public.campaigns;
CREATE TRIGGER trg_reset_campaign_renewal_flags
  BEFORE UPDATE OF end_date ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.reset_campaign_renewal_flags();

-- ---------- B: daily cron for the renewal check (pattern: 20260602084240) ----------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('campaign-renewal-notifications');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'campaign-renewal-notifications',
  '30 8 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/campaign-renewal-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);
