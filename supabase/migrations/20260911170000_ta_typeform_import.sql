-- Talent acquisition imports, 11 Sep 2026 (Elena, morning call).
--
-- 1. First and last name on the call-list row. Elena's Close templates use
--    {first name}; a single full_name meant every import needed hand edits.
-- 2. Typeform answers on the call-list row. Everyone now screens themselves
--    on a Typeform (job-board applicants, headhunted people, commission-only),
--    so the phone-screen questions are no longer asked. The answers arrive
--    either as extra columns on her Typeform sheet import, or are pulled
--    from the lead's custom fields in the Human Resources Close org by
--    pasting the Close lead link.
-- 3. The Close lead link itself, kept on the screening row and carried to
--    the candidate at booking so the live call trial has it.
--
-- Safe to run twice. Applied by the owner via the hosted SQL editor.

ALTER TABLE public.cv_screenings
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS typeform_answers jsonb,
  ADD COLUMN IF NOT EXISTS close_lead_id text,
  ADD COLUMN IF NOT EXISTS close_lead_url text;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS close_lead_url text;

COMMENT ON COLUMN public.cv_screenings.typeform_answers IS
  'Label → answer map of the candidate''s Typeform self-screening, from a sheet import or pulled from the Close lead''s custom fields (11 Sep 2026).';
