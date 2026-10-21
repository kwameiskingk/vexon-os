-- Enquire fixes (19 Sep 2026, after the owner's first live test).
-- 1. The hiring sink wrote values cv_screenings rejects: ingested_via 'form'
--    and a free-text reject_reason. the owner's own application never reached the
--    screening list. Extend both lists.
ALTER TABLE public.cv_screenings DROP CONSTRAINT IF EXISTS cv_screenings_ingested_via_check;
ALTER TABLE public.cv_screenings ADD CONSTRAINT cv_screenings_ingested_via_check
  CHECK (ingested_via IN ('agent','sheet_import','form'));
ALTER TABLE public.cv_screenings DROP CONSTRAINT IF EXISTS cv_screenings_reject_reason_check;
ALTER TABLE public.cv_screenings ADD CONSTRAINT cv_screenings_reject_reason_check
  CHECK (reject_reason IN ('tenure_under_10_months','b2c_only','no_sales_experience','stale','long_gap','below_threshold','form_knockout'));

-- 2. SDR application: Elena's Loom question (her wording, sent 19 Sep), a
--    personal-email placeholder, and the owner's thank-you wording on both endings.
--    Applied to the draft and the live copy; the form is already published.
CREATE OR REPLACE FUNCTION pg_temp.enquire_patch(s jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_set(jsonb_set(s, '{questions}', (
    SELECT jsonb_agg(
      CASE q->>'id'
        WHEN 'loom' THEN q
          || jsonb_build_object(
               'title', 'Please record a short video reading the script below, then paste the Loom link here.',
               'help', E'You can record it free at loom.com and paste the link in the answer box.\n\n"Hi, my name is Sarah Roberts, and I work for a recruitment agency that specialises in helping businesses find experienced sales professionals. For the last three years, I''ve worked in outbound sales, reaching out to prospective clients, building strong relationships, and arranging appointments for senior account executives.\n\nOn a typical day, I speak with recruitment business owners and directors across the UK to understand their hiring requirements and introduce our recruitment services. My role involves making a high volume of outbound calls, handling objections professionally, qualifying opportunities, and ensuring that every conversation provides value to the person I''m speaking with."\n\nThis field is required. Applications that don''t submit a Loom video will not be processed. Make sure the video is accessible and working before pasting the link.',
               'placeholder', 'https://www.loom.com/share/…')
        WHEN 'email' THEN q || jsonb_build_object('placeholder', 'you@email.com')
        ELSE q END ORDER BY ord)
    FROM jsonb_array_elements(s->'questions') WITH ORDINALITY AS t(q, ord))),
  '{endings}', (
    SELECT jsonb_agg(e || jsonb_build_object('title', 'Thank you. We have received your application.', 'body', 'If you''re the right fit for us, we''ll be in touch.') ORDER BY ord)
    FROM jsonb_array_elements(s->'endings') WITH ORDINALITY AS t(e, ord)));
$$;
UPDATE public.forms
   SET schema = pg_temp.enquire_patch(schema),
       published_schema = CASE WHEN published_schema IS NULL THEN NULL ELSE pg_temp.enquire_patch(published_schema) END,
       updated_at = now()
 WHERE slug = 'sdr-application';

-- Proof
SELECT
  (SELECT pg_get_constraintdef(oid) LIKE '%form%' FROM pg_constraint WHERE conname='cv_screenings_ingested_via_check') AS ingested_ok,
  (SELECT pg_get_constraintdef(oid) LIKE '%below_threshold%' FROM pg_constraint WHERE conname='cv_screenings_reject_reason_check') AS reject_ok,
  (SELECT q->>'title' FROM forms, jsonb_array_elements(published_schema->'questions') q WHERE slug='sdr-application' AND q->>'id'='loom') AS loom_title,
  (SELECT e->>'title' FROM forms, jsonb_array_elements(published_schema->'endings') e WHERE slug='sdr-application' LIMIT 1) AS ending_title;
