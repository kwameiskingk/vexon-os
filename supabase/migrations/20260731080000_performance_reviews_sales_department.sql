-- RECORD-KEEPING MIGRATION — ALREADY APPLIED TO THE LIVE DB (2026-07-31,
-- run manually by the owner in the hosted SQL editor; Phase 0 of the AE review
-- unblock). Committed so migration history matches the live schema. Every
-- statement is idempotent, so accidentally re-running it is a no-op.
--
-- Widens performance_reviews.department CHECK to include 'sales'. The AE
-- review engine (PR #77) inserts department='sales'; the original CHECK
-- (20260721120000) only allowed acquisition/fulfilment, which failed every
-- AE review at the INSERT step. Pattern copied from 20260728110000:
-- catalog-lookup drop (the constraint may not carry the assumed name; a
-- name-based drop could silently stack), then re-add.

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.performance_reviews'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%department%'
  LOOP
    EXECUTE format('ALTER TABLE public.performance_reviews DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.performance_reviews
  ADD CONSTRAINT performance_reviews_department_check
  CHECK (department IS NULL OR department IN ('acquisition', 'fulfilment', 'sales'));
