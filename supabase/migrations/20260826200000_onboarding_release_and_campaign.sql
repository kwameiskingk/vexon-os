-- ============================================================================
-- CLIENT ONBOARDING — batch 2: release gate + campaign creation
-- 2026-08-26 · From the Daniel Okoro walkthrough (Fathom, 26 Aug):
--   · the client is explicitly RELEASED from the journey to the live portal,
--     and their Onboarding tab disappears once released;
--   · at 100% the CSM CREATES a campaign (name + start date + duration) and
--     then STARTS it manually — "there could be delays", so campaign start is
--     a deliberate human act, not an automatic consequence of onboarding.
--
-- Parts:
--   A. client_onboarding_journeys.released_at + campaign_id
--   B. campaigns.status gains 'pending' (created-but-not-started)
--
-- Self-guarded: safe to re-run. Apply via the hosted builder SQL editor.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- A. Release bookkeeping on the journey
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_onboarding_journeys
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_by uuid,
  ADD COLUMN IF NOT EXISTS campaign_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_onboarding_journeys_campaign_id_fkey'
  ) THEN
    ALTER TABLE public.client_onboarding_journeys
      ADD CONSTRAINT client_onboarding_journeys_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Journeys completed before this migration were released by the old
-- mark-live action — backfill so their clients aren't re-contained.
UPDATE public.client_onboarding_journeys
SET released_at = COALESCE(released_at, campaign_live_at, completed_at)
WHERE status = 'completed' AND released_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- B. campaigns.status: allow 'pending' (created, awaiting the CSM's start)
--    The client portal reads campaigns with status='active' only, so a pending
--    campaign is invisible to the client by construction — which is the point.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.campaigns'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.campaigns DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_status_check
    CHECK (status IN ('pending', 'active', 'paused', 'completed'));
END $$;
