
CREATE TABLE public.dev_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  stream TEXT NOT NULL DEFAULT 'application',
  status TEXT NOT NULL DEFAULT 'idea',
  priority TEXT NOT NULL DEFAULT 'medium',
  departments TEXT[] NOT NULL DEFAULT '{}',
  target_user_id UUID,
  target_month DATE,
  shipped_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_projects TO authenticated;
GRANT ALL ON public.dev_projects TO service_role;
ALTER TABLE public.dev_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_projects dev all" ON public.dev_projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role));

CREATE TRIGGER trg_dev_projects_updated
  BEFORE UPDATE ON public.dev_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.dev_project_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.dev_projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  author_name TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_project_notes TO authenticated;
GRANT ALL ON public.dev_project_notes TO service_role;
ALTER TABLE public.dev_project_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_project_notes dev all" ON public.dev_project_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role));

CREATE INDEX idx_dev_projects_status ON public.dev_projects(status);
CREATE INDEX idx_dev_projects_stream ON public.dev_projects(stream);
CREATE INDEX idx_dev_project_notes_project ON public.dev_project_notes(project_id);
