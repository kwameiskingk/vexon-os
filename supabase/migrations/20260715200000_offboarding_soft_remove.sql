-- Soft-remove for the offboarding kanban, mirroring the onboarding pattern
-- (20260715090000): removing a client from the board stamps removed_at
-- instead of deleting; the record and its task history stay queryable.
-- NULL = on the board; timestamp = removed. client_profile_id is NOT
-- unique here, so a client can re-enter offboarding later with a fresh
-- record — no revive logic needed.
ALTER TABLE public.client_offboarding_stages
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;
