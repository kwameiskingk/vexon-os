-- Forced first-login password reset.
--
-- Every account currently shares the same seed password. This flag forces
-- each user through a blocking password-change modal on their next login,
-- after which they use their own distinct password going forward.
--
-- Default is `true` so that:
--   * every existing user is forced to reset (backfilled below), and
--   * every future account (incl. admin-created users with a temp password)
--     is forced to reset on first login.
-- The app clears the flag only after the user successfully sets a new
-- password. Existing self-update RLS ("Users can update their own profile",
-- USING auth.uid() = id) already lets a user clear their own flag.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- Backfill: everyone still on the shared seed password must reset.
UPDATE public.profiles SET must_change_password = true;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'When true, the app blocks all routes behind a password-reset modal until the user sets a new password. Cleared by the app after a successful password change.';
