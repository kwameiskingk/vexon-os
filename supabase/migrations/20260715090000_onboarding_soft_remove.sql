-- Soft-remove for the onboarding kanban. Removing a client from the board
-- previously hard-deleted the client_onboarding_stages row and all its
-- client_onboarding_tasks; it now stamps removed_at instead (mirroring the
-- offboarding mark-inactive pattern), so the record and its task history
-- stay fully queryable. NULL = on the board; timestamp = removed.
-- client_profile_id stays UNIQUE — re-adding a removed client revives the
-- same row (clears removed_at) rather than inserting a new one.
ALTER TABLE public.client_onboarding_stages
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;
