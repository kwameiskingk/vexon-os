ALTER TABLE public.setters_profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS setters_profiles_is_test_account_idx
  ON public.setters_profiles (is_test_account) WHERE is_test_account = false;

COMMENT ON COLUMN public.setters_profiles.is_test_account IS
  'When true, the setter is a test account and is hidden from display lists (leaderboards, morning meeting, setter management, metrics, AI insights). Account still functions for auth, client assignment, and admin oversight.';