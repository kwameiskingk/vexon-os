-- AE title + name hygiene (Batch D of the AE Close linkage step 2).
-- NOT yet applied when committed — run manually in the hosted SQL editor
-- (printed in the PR). Idempotent; safe to re-run.
--
-- 1. Widen the title CHECK to allow 'ae' — AE profile rows stop carrying
--    the misleading default 'sdr'. 'ae' is NOT part of the SDR promotion
--    ladder (setterTitles.ts keeps TITLE_ORDER SDR-only).
-- 2. Set Oliver and Rory's titles to 'ae'.
-- 3. Trim the trailing space in Oliver Grant's full_name (both tables).

-- Drop the existing title CHECK by catalog lookup (same stacking-safety
-- pattern as the department constraint).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.setters_profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%title%'
  LOOP
    EXECUTE format('ALTER TABLE public.setters_profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.setters_profiles
  ADD CONSTRAINT setters_profiles_title_check
  CHECK (title IN ('trainee_sdr', 'sdr', 'lead_sdr', 'senior_sdr', 'ae'));

-- AE profile rows carry the AE title.
UPDATE public.setters_profiles
SET title = 'ae'
WHERE department = 'sales' AND title <> 'ae';

-- Name hygiene: trim stray whitespace on Oliver's rows (scoped by user_id,
-- not name, so it can't touch anyone else).
UPDATE public.setters_profiles
SET full_name = trim(full_name)
WHERE user_id = '193e5c2a-0171-4325-860c-29826d58fc8e'
  AND full_name <> trim(full_name);

UPDATE public.profiles
SET full_name = trim(full_name)
WHERE id = '193e5c2a-0171-4325-860c-29826d58fc8e'
  AND full_name <> trim(full_name);
