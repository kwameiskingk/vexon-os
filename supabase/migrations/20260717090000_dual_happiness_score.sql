-- Dual happiness score (Marcus's ruling via the owner, 2026-07-16):
-- happiness_override is REPURPOSED into the standing CSM-subjective score.
-- It no longer overrides anything — the metric score (weekly target AND
-- 3-week streak) and the CSM score render side by side, never blended.
-- Capture moves to the weekly catch-up completion form.

-- Guard: the repurpose is only safe because no overrides were ever recorded.
-- Abort outright if that assumption is wrong.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.client_profiles WHERE happiness_override IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'happiness_override contains data; the repurpose ruling assumed zero rows — do not apply, report back';
  END IF;
END $$;

-- Standing score on the client (NULL = never assessed).
ALTER TABLE public.client_profiles
  RENAME COLUMN happiness_override TO csm_happy;
ALTER TABLE public.client_profiles
  RENAME COLUMN happiness_override_note TO csm_happy_note;
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS csm_happy_assessed_at timestamptz;

-- Per-catch-up history: each completed catch-up records the assessment
-- given at that catch-up.
ALTER TABLE public.client_catchups
  ADD COLUMN IF NOT EXISTS csm_happy boolean,
  ADD COLUMN IF NOT EXISTS csm_happy_note text;
