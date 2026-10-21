-- Enquire: the Typeform features it still lacked (20 Sep 2026, the owner).
-- 1. Responses: tags + reviewed mark + notes (Elena's "who have I looked at"),
--    and the Close lead id once pushed. Managers may now UPDATE responses.
ALTER TABLE public.form_responses
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS close_lead_id text,
  ADD COLUMN IF NOT EXISTS close_pushed_at timestamptz;
DROP POLICY IF EXISTS "Form responses: managers update" ON public.form_responses;
CREATE POLICY "Form responses: managers update" ON public.form_responses
  FOR UPDATE TO authenticated
  USING (public.is_form_manager(auth.uid())) WITH CHECK (public.is_form_manager(auth.uid()));

-- 2. Forms: an email per completed response, and the Close push switch.
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS notify_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS close_push boolean NOT NULL DEFAULT false;

-- 3. Version history: every Publish keeps the schema it went live with.
CREATE TABLE IF NOT EXISTS public.form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  version int NOT NULL,
  schema jsonb NOT NULL,
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, version)
);
ALTER TABLE public.form_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Form versions: managers read" ON public.form_versions;
CREATE POLICY "Form versions: managers read" ON public.form_versions
  FOR SELECT TO authenticated USING (public.is_form_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.forms_keep_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.published_schema IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.published_schema IS NOT DISTINCT FROM OLD.published_schema THEN RETURN NEW; END IF;
  INSERT INTO public.form_versions (form_id, version, schema, published_by)
  VALUES (NEW.id, (SELECT COALESCE(MAX(version), 0) + 1 FROM public.form_versions WHERE form_id = NEW.id), NEW.published_schema, auth.uid());
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_forms_keep_version ON public.forms;
CREATE TRIGGER trg_forms_keep_version
  AFTER INSERT OR UPDATE OF published_schema ON public.forms
  FOR EACH ROW EXECUTE FUNCTION public.forms_keep_version();
-- Version 1 for the forms that are already live.
INSERT INTO public.form_versions (form_id, version, schema, published_at)
SELECT f.id, 1, f.published_schema, COALESCE(f.published_at, now())
FROM public.forms f
WHERE f.published_schema IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.form_versions v WHERE v.form_id = f.id);

-- 4. Pictures and videos uploaded from the builder: a public bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('form-media', 'form-media', true, 26214400,
        ARRAY['image/png','image/jpeg','image/gif','image/webp','image/svg+xml','video/mp4','video/webm'])
ON CONFLICT (id) DO NOTHING;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Form media: public read') THEN
    EXECUTE $p$CREATE POLICY "Form media: public read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'form-media')$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Form media: managers add') THEN
    EXECUTE $p$CREATE POLICY "Form media: managers add" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'form-media' AND public.is_form_manager(auth.uid()))$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Form media: managers remove') THEN
    EXECUTE $p$CREATE POLICY "Form media: managers remove" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'form-media' AND public.is_form_manager(auth.uid()))$p$;
  END IF;
END $$;

-- Proof
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_responses' AND column_name='tags') AS tags_ok,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='forms' AND column_name='close_push') AS close_ok,
  (SELECT count(*) FROM public.form_versions) AS versions,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id='form-media') AS media_bucket_ok;
