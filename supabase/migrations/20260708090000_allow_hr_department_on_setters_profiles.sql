-- Allow 'hr' as a setters_profiles department value.
-- Non-setter staff (e.g. the ops user who runs the HR function) need a
-- setters_profiles row purely to hold a Close user ID so the Close KPI
-- pipeline can key their dials/talk-time telemetry (CEO HR tile).
-- department 'hr' keeps these rows out of setter rosters and leaderboards,
-- which filter on fulfilment/acquisition and/or the setter role.

-- Drop the existing department CHECK by catalog lookup rather than assumed
-- name: if the original inline CHECK (20251105071348, fulfilment/acquisition
-- only) was auto-named differently, a name-based DROP IF EXISTS would
-- silently no-op and the new constraint would stack with the old one,
-- rejecting every 'hr' insert.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.setters_profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%department%'
  LOOP
    EXECUTE format('ALTER TABLE public.setters_profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.setters_profiles
  ADD CONSTRAINT setters_profiles_department_check
  CHECK (department IN ('fulfilment', 'acquisition', 'hr'));
