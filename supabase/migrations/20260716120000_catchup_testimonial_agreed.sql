-- Testimonial agreement flag (Step 1 ruling, 2026-07-16): the catch-up
-- checkbox becomes a pure flag meaning "client agreed / one is coming up".
-- It no longer writes to testimonials — only the standalone Log Testimonial
-- action inserts there, so the CEO tile counts collected testimonials only.
ALTER TABLE public.client_catchups
  ADD COLUMN IF NOT EXISTS testimonial_agreed boolean NOT NULL DEFAULT false;
