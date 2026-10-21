-- Elena batch, 1 Sep 2026 (Dev Catch Up call + Marcus's morning call):
--
-- A. Phone screen gains three questions:
--    Q3  "What is your current job title?"            -> current_job_title
--    Q14 children + care during working hours         -> has_children, childcare_support
--    Q15 health / reasonable-adjustments              -> health_adjustments
--    The two care/health answers are logistics facts only — they must never
--    be used as rejection reasons (Elena/Marcus, 1 Sep).
--
-- B. Dials/day + appointments/month become free text as entered ("50-100",
--    "100+") in new *_raw columns. The numeric columns STAY and keep feeding
--    qualification_criteria — the app derives a conservative number (first
--    number in the text) alongside the raw answer. Marcus reads the raw text.
--
-- C. cv_screenings.source — which job board a CV came from (linkedin /
--    indeed / typeform / headhunt / ...). Free text on purpose: a new intake
--    folder in the shared drive starts labelling itself without a migration.
--    The screening agent supplies it per run; CSV imports already carried it
--    in flags as 'source:<value>' — backfilled below, flags left untouched
--    (flag presence still drives the compact-modal switch).

ALTER TABLE public.candidate_phone_screens
  ADD COLUMN IF NOT EXISTS current_job_title text,
  ADD COLUMN IF NOT EXISTS avg_dials_per_day_raw text,
  ADD COLUMN IF NOT EXISTS avg_appointments_per_month_raw text,
  ADD COLUMN IF NOT EXISTS has_children boolean,
  ADD COLUMN IF NOT EXISTS childcare_support boolean,
  ADD COLUMN IF NOT EXISTS health_adjustments boolean;

ALTER TABLE public.cv_screenings
  ADD COLUMN IF NOT EXISTS source text;

-- Backfill C from the CSV-import flags (first source: entry wins; rows with
-- no flag stay NULL — the Drive-folder backfill fills those separately).
UPDATE public.cv_screenings c
SET source = sub.src
FROM (
  SELECT id,
         (SELECT replace(f, 'source:', '')
            FROM unnest(flags) AS f
           WHERE f LIKE 'source:%'
           LIMIT 1) AS src
  FROM public.cv_screenings
  WHERE source IS NULL
) sub
WHERE c.id = sub.id AND sub.src IS NOT NULL;
