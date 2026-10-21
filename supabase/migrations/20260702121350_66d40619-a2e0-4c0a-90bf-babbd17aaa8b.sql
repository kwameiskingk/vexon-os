-- Add optional ramp_stage to setters_profiles.
-- Nullable, no default → all existing setter rows keep their current data
-- and simply show as "unset" until the SDR manager assigns a stage.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'setter_ramp_stage'
  ) THEN
    CREATE TYPE public.setter_ramp_stage AS ENUM ('ramping', 'ramped');
  END IF;
END$$;

ALTER TABLE public.setters_profiles
  ADD COLUMN IF NOT EXISTS ramp_stage public.setter_ramp_stage;

COMMENT ON COLUMN public.setters_profiles.ramp_stage IS
  'Optional ramp stage classification set by SDR managers. NULL = not classified. Used by CEO Fulfilment team → Management view "Team ramp status" tile.';