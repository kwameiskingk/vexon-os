-- Uploaded onboarding media (4 Sep 2026). the owner's ruling: most walkthrough
-- videos come off the shared drive rather than Loom or YouTube, so they are
-- uploaded straight into Vexon OS. A card can carry a thumbnail (shown on its
-- left panel, matching the design references) and a video; clicking the
-- thumbnail opens the video in a near-full-screen player with scrub, ten
-- second skip, playback speed and full screen.
--
-- What this does:
--   1. Creates the private `onboarding-media` bucket: 1 GB per file, video
--      and image types only. Videos are long, so uploads use a signed upload
--      URL with a real progress bar; playback uses a signed URL, which
--      supports range requests, so seeking works.
--   2. Storage policies: the staff tier that authors flows (admin, dev, ops,
--      csm, hr, plus the can_screen_candidates capability Elena uses) can
--      write and delete; any signed-in user can read, because starters and
--      clients have to watch what is on their own cards. The bucket holds
--      training material only, never client or candidate data.
--   3. Adds thumbnail_path / video_path to onboarding_step_templates so the
--      SDR flow builder can hold them. The client flow keeps its media in
--      client_flow_steps.config (jsonb), so it needs no schema change.
--
-- SAFE TO RUN TWICE: every statement is IF NOT EXISTS / ON CONFLICT /
-- guarded. The app degrades gracefully before this runs: both flow builders
-- fall back to the plain "Video URL" field and cards show no thumbnail.
--
-- NOTE: applied by the owner via the hosted SQL editor; migration bookkeeping
--       unaware. Never `supabase db push`. Repair list:
--       supabase migration repair --status applied 20260904120000

-- ── 1. Bucket ──────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-media', 'onboarding-media', false, 1073741824,
  ARRAY['video/mp4','video/quicktime','video/webm','video/x-m4v','video/mpeg',
        'image/png','image/jpeg','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Storage policies ────────────────────────────────────────────────────
DO $$
DECLARE
  v_authors text :=
    $q$(
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'dev'::public.app_role)
      OR public.has_role(auth.uid(), 'ops'::public.app_role)
      OR public.has_role(auth.uid(), 'csm'::public.app_role)
      OR public.has_role(auth.uid(), 'hr'::public.app_role)
    )$q$;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Onboarding media readable by signed-in users') THEN
    EXECUTE $p$CREATE POLICY "Onboarding media readable by signed-in users" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'onboarding-media')$p$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Flow authors upload onboarding media') THEN
    EXECUTE format(
      $p$CREATE POLICY "Flow authors upload onboarding media" ON storage.objects
         FOR INSERT TO authenticated
         WITH CHECK (bucket_id = 'onboarding-media' AND %s)$p$, v_authors);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Flow authors replace onboarding media') THEN
    EXECUTE format(
      $p$CREATE POLICY "Flow authors replace onboarding media" ON storage.objects
         FOR UPDATE TO authenticated
         USING (bucket_id = 'onboarding-media' AND %s)
         WITH CHECK (bucket_id = 'onboarding-media' AND %s)$p$, v_authors, v_authors);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Flow authors delete onboarding media') THEN
    EXECUTE format(
      $p$CREATE POLICY "Flow authors delete onboarding media" ON storage.objects
         FOR DELETE TO authenticated
         USING (bucket_id = 'onboarding-media' AND %s)$p$, v_authors);
  END IF;
END $$;

-- Elena authors the SDR flow through the can_screen_candidates capability
-- rather than an hr/ops role, so she gets the same write access. Guarded:
-- only when the capability helper exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_capability' AND pronamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='TA writes onboarding media') THEN
      EXECUTE $p$CREATE POLICY "TA writes onboarding media" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'onboarding-media'
                    AND public.has_capability(auth.uid(), 'can_screen_candidates'))$p$;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='TA deletes onboarding media') THEN
      EXECUTE $p$CREATE POLICY "TA deletes onboarding media" ON storage.objects
        FOR DELETE TO authenticated
        USING (bucket_id = 'onboarding-media'
               AND public.has_capability(auth.uid(), 'can_screen_candidates'))$p$;
    END IF;
  END IF;
END $$;

-- ── 3. Media columns on the SDR flow templates ────────────────────────────
ALTER TABLE public.onboarding_step_templates
  ADD COLUMN IF NOT EXISTS thumbnail_path text;
ALTER TABLE public.onboarding_step_templates
  ADD COLUMN IF NOT EXISTS video_path text;
