-- CV upload + missing-CV chase alert — supporting objects.
-- APPLIED VIA THE HOSTED SQL EDITOR (not auto-applied from this repo).
-- Idempotent: safe to run more than once.

-- 1) Deduplicated CV-chase notification, as a SECURITY DEFINER function.
--
-- The chase bell must fire once per candidate regardless of WHO performs the
-- move (a TA-session move, or a CEO/ops/admin move, or the day-of auto-move
-- sweep). A client-side "select unread then insert" cannot dedupe reliably:
-- the notifications SELECT policy hides talent_acquisition rows from anyone
-- not holding that role, so an admin/ops mover always reads an empty set and
-- inserts a duplicate. Running the check+insert inside a definer function
-- fixes both problems atomically — it sees every row and inserts under the
-- function owner's rights, so no broadening of the notifications INSERT
-- policy is needed. Any authenticated staff member may call it; the worst it
-- can do is raise one TA-facing bell.
CREATE OR REPLACE FUNCTION public.notify_ta_cv_missing(
  p_candidate_id uuid,
  p_candidate_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link text := '/ta/tracking?cv-chase=' || p_candidate_id::text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE recipient_role = 'talent_acquisition'
      AND link_url = v_link
      AND is_read = false
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications
    (category, recipient_id, recipient_role, title, message, link_url)
  VALUES (
    'system', NULL, 'talent_acquisition',
    'CV missing for final interview',
    coalesce(p_candidate_name, 'A candidate')
      || ' has reached Final Interview with no CV on file — chase it up and '
      || 'upload it from their card before the interview.',
    v_link
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_ta_cv_missing(uuid, text) TO authenticated;

-- 2) Re-assert the TA write lane on the candidate-cvs bucket.
--
-- Identical to the M2 block of
-- docs/pending-migrations/2026-08-14-ta-portal-and-hiring-pipeline.sql
-- (L169-175), which is believed applied — in which case this is a no-op
-- re-create. To check beforehand:
--   SELECT policyname FROM pg_policies
--   WHERE tablename = 'objects' AND schemaname = 'storage'
--     AND policyname = 'TA manages candidate CVs';
DROP POLICY IF EXISTS "TA manages candidate CVs" ON storage.objects;
CREATE POLICY "TA manages candidate CVs" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'candidate-cvs'
         AND public.has_capability(auth.uid(), 'can_screen_candidates'))
  WITH CHECK (bucket_id = 'candidate-cvs'
              AND public.has_capability(auth.uid(), 'can_screen_candidates'));
