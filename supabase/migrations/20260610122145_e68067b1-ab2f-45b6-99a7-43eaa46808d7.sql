
-- 1. dev_tickets
CREATE TABLE public.dev_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL,
  reporter_name TEXT,
  reporter_email TEXT,
  reporter_role TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'bug',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL DEFAULT 'user',
  assignee_id UUID,
  url TEXT,
  user_agent TEXT,
  viewport TEXT,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_tickets TO authenticated;
GRANT ALL ON public.dev_tickets TO service_role;
ALTER TABLE public.dev_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_tickets reporter read own"
  ON public.dev_tickets FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "dev_tickets insert own"
  ON public.dev_tickets FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "dev_tickets dev update"
  ON public.dev_tickets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "dev_tickets dev delete"
  ON public.dev_tickets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'dev'::app_role));

CREATE TRIGGER trg_dev_tickets_updated
  BEFORE UPDATE ON public.dev_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. dev_ticket_comments
CREATE TABLE public.dev_ticket_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.dev_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  author_name TEXT,
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_ticket_comments TO authenticated;
GRANT ALL ON public.dev_ticket_comments TO service_role;
ALTER TABLE public.dev_ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_ticket_comments read"
  ON public.dev_ticket_comments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev'::app_role)
    OR (
      NOT is_internal
      AND EXISTS (SELECT 1 FROM public.dev_tickets t WHERE t.id = ticket_id AND t.reporter_id = auth.uid())
    )
  );

CREATE POLICY "dev_ticket_comments insert"
  ON public.dev_ticket_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'dev'::app_role)
      OR (
        NOT is_internal
        AND EXISTS (SELECT 1 FROM public.dev_tickets t WHERE t.id = ticket_id AND t.reporter_id = auth.uid())
      )
    )
  );

CREATE POLICY "dev_ticket_comments dev manage"
  ON public.dev_ticket_comments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "dev_ticket_comments dev delete"
  ON public.dev_ticket_comments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'dev'::app_role));

-- 3. dev_ticket_attachments
CREATE TABLE public.dev_ticket_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.dev_tickets(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_ticket_attachments TO authenticated;
GRANT ALL ON public.dev_ticket_attachments TO service_role;
ALTER TABLE public.dev_ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_ticket_attachments read"
  ON public.dev_ticket_attachments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev'::app_role)
    OR EXISTS (SELECT 1 FROM public.dev_tickets t WHERE t.id = ticket_id AND t.reporter_id = auth.uid())
  );

CREATE POLICY "dev_ticket_attachments insert"
  ON public.dev_ticket_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'dev'::app_role)
      OR EXISTS (SELECT 1 FROM public.dev_tickets t WHERE t.id = ticket_id AND t.reporter_id = auth.uid())
    )
  );

CREATE POLICY "dev_ticket_attachments dev delete"
  ON public.dev_ticket_attachments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'dev'::app_role));

-- 4. dev_feature_flags
CREATE TABLE public.dev_feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_feature_flags TO authenticated;
GRANT ALL ON public.dev_feature_flags TO service_role;
ALTER TABLE public.dev_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_feature_flags read all"
  ON public.dev_feature_flags FOR SELECT TO authenticated USING (true);

CREATE POLICY "dev_feature_flags dev write"
  ON public.dev_feature_flags FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "dev_feature_flags dev update"
  ON public.dev_feature_flags FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "dev_feature_flags dev delete"
  ON public.dev_feature_flags FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'dev'::app_role));

CREATE TRIGGER trg_dev_feature_flags_updated
  BEFORE UPDATE ON public.dev_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. dev_changelog
CREATE TABLE public.dev_changelog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT,
  title TEXT NOT NULL,
  body TEXT,
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  author_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_changelog TO authenticated;
GRANT ALL ON public.dev_changelog TO service_role;
ALTER TABLE public.dev_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_changelog read published or dev"
  ON public.dev_changelog FOR SELECT TO authenticated
  USING (published = true OR public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "dev_changelog dev write"
  ON public.dev_changelog FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "dev_changelog dev update"
  ON public.dev_changelog FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "dev_changelog dev delete"
  ON public.dev_changelog FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'dev'::app_role));

CREATE TRIGGER trg_dev_changelog_updated
  BEFORE UPDATE ON public.dev_changelog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 6. maintenance flag on system_settings
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_message TEXT;

-- Allow all authenticated users to read system_settings (needed for maintenance flag).
DROP POLICY IF EXISTS "Authenticated can read system settings" ON public.system_settings;
CREATE POLICY "Authenticated can read system settings"
  ON public.system_settings FOR SELECT TO authenticated USING (true);
