-- Setter Assignment roster: more than one setter on a client on the same day
-- (the owner, 7 Oct 2026). Jordan and Lena both dial for Ridgeway Legal today,
-- and each needs the client in their own booking hub, which reads today's
-- roster_entries for the setter. The old key allowed one setter per client
-- per day; the new one allows many, but never the same setter twice.
-- Safe to run twice.

ALTER TABLE public.roster_entries
  DROP CONSTRAINT IF EXISTS roster_entries_client_profile_id_roster_date_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'roster_entries_client_date_setter_key'
      AND conrelid = 'public.roster_entries'::regclass
  ) THEN
    ALTER TABLE public.roster_entries
      ADD CONSTRAINT roster_entries_client_date_setter_key
      UNIQUE (client_profile_id, roster_date, setter_profile_id);
  END IF;
END $$;
