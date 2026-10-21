-- Projects tab (Marcus's ask, approved by the owner, 13 Sep 2026).
--
-- "Core Team Projects" on the CEO Overview (ceo_initiatives) becomes its own
-- sidebar tab with multi-contributor projects, a five-step status that is
-- separate from task hit-or-miss (due to start → started → halfway → testing
-- → done), a daily log that rolls the "remaining" list forward day by day,
-- and links from daily-task templates and department-head goals so a
-- project page can show the hit/miss history of the work feeding it.
--
-- Tables: projects, project_members, project_updates.
-- Columns: tasks.project_id, department_head_goals.project_id.
-- Capability: can_view_projects — granted to every holder of
--   can_view_ceo_dashboard (both role- and user-level grants), so Marcus,
--   Elena, admin and dev keep parity on day one. Granting it to someone
--   else later (user_capabilities) gives them the tab without CEO access.
-- Access: capability holders + admin/dev manage everything; a project
--   member sees the projects they belong to and can write the daily log.
-- Carry-over: ceo_initiatives rows are copied into projects ONCE (only when
--   projects is empty); ceo_initiatives is left in place, untouched.
--
-- Idempotent — safe to run twice. Every statement self-guards.
-- NOTE: applied via the hosted builder SQL editor; migration bookkeeping unaware.
--       Never `supabase db push` this file. Add to the repair list:
--       supabase migration repair --status applied 20260913150000

-- ============================================================
-- 1. Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  department text,                          -- same vocabulary as ceo_initiatives
  status text NOT NULL DEFAULT 'due_to_start',
  target_date date,
  progress_pct integer,                     -- legacy % carried from ceo_initiatives; the status is the truth
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT projects_status_check CHECK (status IN ('due_to_start','started','halfway','testing','done')),
  CONSTRAINT projects_department_check CHECK (department IS NULL OR department IN ('sales','ops','hr','dev','other')),
  CONSTRAINT projects_progress_range CHECK (progress_pct IS NULL OR (progress_pct >= 0 AND progress_pct <= 100))
);

CREATE TABLE IF NOT EXISTS public.project_members (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_lead boolean NOT NULL DEFAULT false,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.project_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  update_date date NOT NULL DEFAULT CURRENT_DATE,
  done_text text,
  remaining_text text,
  blocker_text text,
  author_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, update_date)
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects (status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members (user_id);
CREATE INDEX IF NOT EXISTS idx_project_updates_project_date ON public.project_updates (project_id, update_date DESC);

-- updated_at triggers (shared helper already exists)
DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.projects;
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_project_updates_updated_at ON public.project_updates;
CREATE TRIGGER trg_project_updates_updated_at
  BEFORE UPDATE ON public.project_updates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. Links from daily tasks and department-head goals
--    (task_instances.template_task_id → tasks.id, so instance hit/miss
--     history rolls up to a project through the template.)
-- ============================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks (project_id) WHERE project_id IS NOT NULL;

ALTER TABLE public.department_head_goals
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dhg_project ON public.department_head_goals (project_id) WHERE project_id IS NOT NULL;

-- ============================================================
-- 3. Capability: can_view_projects follows can_view_ceo_dashboard
-- ============================================================

INSERT INTO public.role_capabilities (role, capability)
SELECT rc.role, 'can_view_projects'
FROM public.role_capabilities rc
WHERE rc.capability = 'can_view_ceo_dashboard'
ON CONFLICT DO NOTHING;

INSERT INTO public.user_capabilities (user_id, capability, granted_by)
SELECT uc.user_id, 'can_view_projects', uc.granted_by
FROM public.user_capabilities uc
WHERE uc.capability = 'can_view_ceo_dashboard'
ON CONFLICT (user_id, capability) DO NOTHING;

-- ============================================================
-- 4. Helpers (SECURITY DEFINER so the member check never recurses through
--    RLS on project_members while evaluating a projects policy)
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_manage_projects(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_capability(_user_id, 'can_view_projects')
      OR public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'dev'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = _project_id AND pm.user_id = _user_id
  );
$$;

-- ============================================================
-- 5. Grants + RLS (anon gets nothing)
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_updates TO authenticated;
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.project_members TO service_role;
GRANT ALL ON public.project_updates TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;

-- projects
DROP POLICY IF EXISTS "Projects readable by managers and members" ON public.projects;
CREATE POLICY "Projects readable by managers and members"
  ON public.projects FOR SELECT TO authenticated
  USING (public.can_manage_projects(auth.uid()) OR public.is_project_member(auth.uid(), id));

DROP POLICY IF EXISTS "Projects insert by managers" ON public.projects;
CREATE POLICY "Projects insert by managers"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_projects(auth.uid()));

DROP POLICY IF EXISTS "Projects update by managers" ON public.projects;
CREATE POLICY "Projects update by managers"
  ON public.projects FOR UPDATE TO authenticated
  USING (public.can_manage_projects(auth.uid()))
  WITH CHECK (public.can_manage_projects(auth.uid()));

DROP POLICY IF EXISTS "Projects delete by managers" ON public.projects;
CREATE POLICY "Projects delete by managers"
  ON public.projects FOR DELETE TO authenticated
  USING (public.can_manage_projects(auth.uid()));

-- project_members
DROP POLICY IF EXISTS "Project members readable by managers and members" ON public.project_members;
CREATE POLICY "Project members readable by managers and members"
  ON public.project_members FOR SELECT TO authenticated
  USING (public.can_manage_projects(auth.uid()) OR public.is_project_member(auth.uid(), project_id));

DROP POLICY IF EXISTS "Project members insert by managers" ON public.project_members;
CREATE POLICY "Project members insert by managers"
  ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_projects(auth.uid()));

DROP POLICY IF EXISTS "Project members update by managers" ON public.project_members;
CREATE POLICY "Project members update by managers"
  ON public.project_members FOR UPDATE TO authenticated
  USING (public.can_manage_projects(auth.uid()))
  WITH CHECK (public.can_manage_projects(auth.uid()));

DROP POLICY IF EXISTS "Project members delete by managers" ON public.project_members;
CREATE POLICY "Project members delete by managers"
  ON public.project_members FOR DELETE TO authenticated
  USING (public.can_manage_projects(auth.uid()));

-- project_updates (daily log): members write their own project's log
DROP POLICY IF EXISTS "Project updates readable by managers and members" ON public.project_updates;
CREATE POLICY "Project updates readable by managers and members"
  ON public.project_updates FOR SELECT TO authenticated
  USING (public.can_manage_projects(auth.uid()) OR public.is_project_member(auth.uid(), project_id));

DROP POLICY IF EXISTS "Project updates insert by managers and members" ON public.project_updates;
CREATE POLICY "Project updates insert by managers and members"
  ON public.project_updates FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_projects(auth.uid()) OR public.is_project_member(auth.uid(), project_id));

DROP POLICY IF EXISTS "Project updates update by managers and members" ON public.project_updates;
CREATE POLICY "Project updates update by managers and members"
  ON public.project_updates FOR UPDATE TO authenticated
  USING (public.can_manage_projects(auth.uid()) OR public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.can_manage_projects(auth.uid()) OR public.is_project_member(auth.uid(), project_id));

DROP POLICY IF EXISTS "Project updates delete by managers" ON public.project_updates;
CREATE POLICY "Project updates delete by managers"
  ON public.project_updates FOR DELETE TO authenticated
  USING (public.can_manage_projects(auth.uid()));

-- ============================================================
-- 6. Carry-over from ceo_initiatives (once, only while projects is empty).
--    active → started, paused → due_to_start, done → done.
--    Same id is reused so a row can always be traced back.
--    Owner becomes the lead member (owner_user_id, else a profile whose
--    full_name matches owner_name). ceo_initiatives is NOT dropped.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects) THEN
    INSERT INTO public.projects (id, title, description, department, status, target_date, progress_pct, position, created_at)
    SELECT
      ci.id,
      ci.title,
      ci.description,
      ci.department,
      CASE ci.status WHEN 'active' THEN 'started' WHEN 'paused' THEN 'due_to_start' WHEN 'done' THEN 'done' ELSE 'due_to_start' END,
      ci.deadline,
      ci.progress_pct,
      ci.position,
      ci.created_at
    FROM public.ceo_initiatives ci
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.project_members (project_id, user_id, is_lead, added_by)
    SELECT
      ci.id,
      COALESCE(
        ci.owner_user_id,
        (SELECT p.id FROM public.profiles p
          WHERE lower(trim(p.full_name)) = lower(trim(ci.owner_name))
          ORDER BY p.created_at LIMIT 1)
      ),
      true,
      NULL
    FROM public.ceo_initiatives ci
    WHERE COALESCE(
        ci.owner_user_id,
        (SELECT p.id FROM public.profiles p
          WHERE lower(trim(p.full_name)) = lower(trim(ci.owner_name))
          ORDER BY p.created_at LIMIT 1)
      ) IS NOT NULL
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 7. Proof (the hosted builder's editor prints no row counts)
-- ============================================================

SELECT
  (SELECT count(*) FROM public.projects)                                                             AS projects,
  (SELECT count(*) FROM public.projects WHERE status = 'done')                                       AS projects_done,
  (SELECT count(*) FROM public.project_members)                                                      AS project_members,
  (SELECT count(*) FROM public.project_updates)                                                      AS project_updates,
  (SELECT count(*) FROM public.ceo_initiatives)                                                      AS ceo_initiatives_untouched,
  (SELECT count(*) FROM public.role_capabilities WHERE capability = 'can_view_projects')             AS role_grants,
  (SELECT count(*) FROM public.user_capabilities WHERE capability = 'can_view_projects')             AS user_grants,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='project_id')                  AS tasks_project_col,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='department_head_goals' AND column_name='project_id') AS goals_project_col,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('projects','project_members','project_updates'))                      AS policies;
