-- Enums
CREATE TYPE public.dev_mandate_company AS ENUM ('vexon', 'northgate', 'both');
CREATE TYPE public.dev_mandate_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE public.dev_target_build_type AS ENUM ('dashboard', 'workflow', 'agent', 'undecided');
CREATE TYPE public.dev_target_status AS ENUM ('identified', 'building', 'testing', 'rolled_out');
CREATE TYPE public.dev_stack_status AS ENUM ('active', 'planned');

-- Mandates
CREATE TABLE public.dev_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  company public.dev_mandate_company NOT NULL DEFAULT 'both',
  target_metric text,
  incentive_model text,
  status public.dev_mandate_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_mandates TO authenticated;
GRANT ALL ON public.dev_mandates TO service_role;
ALTER TABLE public.dev_mandates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_only_mandates" ON public.dev_mandates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dev')) WITH CHECK (public.has_role(auth.uid(), 'dev'));

-- Roles
CREATE TABLE public.dev_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company public.dev_mandate_company NOT NULL DEFAULT 'both',
  main_goal text,
  highest_roi_task text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_roles TO authenticated;
GRANT ALL ON public.dev_roles TO service_role;
ALTER TABLE public.dev_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_only_roles" ON public.dev_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dev')) WITH CHECK (public.has_role(auth.uid(), 'dev'));

-- Role targets
CREATE TABLE public.dev_role_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.dev_roles(id) ON DELETE CASCADE,
  task_name text NOT NULL,
  build_type public.dev_target_build_type NOT NULL DEFAULT 'undecided',
  status public.dev_target_status NOT NULL DEFAULT 'identified',
  linked_project_id uuid REFERENCES public.dev_projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_role_targets TO authenticated;
GRANT ALL ON public.dev_role_targets TO service_role;
ALTER TABLE public.dev_role_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_only_role_targets" ON public.dev_role_targets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dev')) WITH CHECK (public.has_role(auth.uid(), 'dev'));

-- Stack tools
CREATE TABLE public.dev_stack_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  layer text NOT NULL,
  note text,
  status public.dev_stack_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_stack_tools TO authenticated;
GRANT ALL ON public.dev_stack_tools TO service_role;
ALTER TABLE public.dev_stack_tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_only_stack_tools" ON public.dev_stack_tools FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dev')) WITH CHECK (public.has_role(auth.uid(), 'dev'));

-- Extend dev_projects
ALTER TABLE public.dev_projects
  ADD COLUMN IF NOT EXISTS mandate_id uuid REFERENCES public.dev_mandates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.dev_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company public.dev_mandate_company,
  ADD COLUMN IF NOT EXISTS baseline_hours_week numeric,
  ADD COLUMN IF NOT EXISTS new_hours_week numeric,
  ADD COLUMN IF NOT EXISTS owner text,
  ADD COLUMN IF NOT EXISTS rolled_out_date date,
  ADD COLUMN IF NOT EXISTS risk_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS risk_note text;

-- updated_at triggers
CREATE TRIGGER trg_dev_mandates_updated BEFORE UPDATE ON public.dev_mandates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dev_roles_updated BEFORE UPDATE ON public.dev_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dev_role_targets_updated BEFORE UPDATE ON public.dev_role_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dev_stack_tools_updated BEFORE UPDATE ON public.dev_stack_tools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed mandate
INSERT INTO public.dev_mandates (title, description, company, target_metric, incentive_model, status)
VALUES (
  'Streamline Ops via AI',
  'Free every role to focus on highest-ROI work by automating low-ROI tasks across Meridian Sales Partners (primary) and Northgate Recruitment Resourcing.',
  'both',
  'Reduce 10-20 hr processes to 5-10 hr',
  'Commission on hours saved',
  'active'
);

-- Seed roles
WITH inserted AS (
  INSERT INTO public.dev_roles (name, company, main_goal, highest_roi_task) VALUES
    ('HR', 'both', 'Keep team constantly resourced for quick growth', 'Headhunting/cold calling'),
    ('SDR Manager', 'both', 'Every setter to 15 sat meetings/mo within 3 months', 'Training/improving SDRs'),
    ('CSM', 'both', 'Get clients to extend contracts + collect testimonials', 'Campaign optimisation + strategy'),
    ('AE', 'both', 'Closing new business', 'Sitting sales calls / reactivating pipeline'),
    ('Acquisition Setter', 'both', 'Book qualified discovery calls that show up', 'Cold calling'),
    ('Fulfilment Setter', 'both', 'Book qualified fulfilment calls that show up', 'Cold calling'),
    ('Developer', 'both', 'Save the team hours weekly + keep systems running', 'Analysing processes to optimise/fix + create new processes')
  RETURNING id, name
)
INSERT INTO public.dev_role_targets (role_id, task_name, build_type, status)
SELECT i.id, t.task_name, 'undecided'::public.dev_target_build_type, t.status::public.dev_target_status
FROM inserted i
JOIN (VALUES
  ('HR', 'Employee onboarding', 'identified'),
  ('HR', 'Employee offboarding', 'identified'),
  ('HR', 'Salary calculation', 'identified'),
  ('HR', 'Metrics calculation', 'identified'),
  ('HR', 'Invoice chasing', 'identified'),
  ('HR', 'Updating sick days/days off', 'identified'),
  ('HR', 'Payslip generation', 'identified'),
  ('HR', 'CV screening', 'identified'),
  ('HR', 'Building Clay lists after headhunting', 'identified'),
  ('SDR Manager', 'Preparing for call reviews', 'rolled_out'),
  ('CSM', 'Client onboarding', 'identified'),
  ('CSM', 'Client offboarding', 'identified'),
  ('CSM', 'Meeting tracking', 'identified'),
  ('CSM', 'Weekly catch-up prep', 'identified'),
  ('CSM', 'Lead list building/updating', 'identified'),
  ('CSM', 'Employee onboarding', 'identified'),
  ('CSM', 'SDR roster', 'identified'),
  ('CSM', 'Calling clients after meeting is sat/booked', 'identified'),
  ('AE', 'Updating the dashboard', 'identified'),
  ('Fulfilment Setter', 'Logging meetings on dashboard', 'identified'),
  ('Acquisition Setter', 'Logging meetings on dashboard', 'identified')
) AS t(role_name, task_name, status) ON t.role_name = i.name;

-- Seed stack tools
INSERT INTO public.dev_stack_tools (name, layer, note, status) VALUES
  ('the hosted builder', 'Front-end/Dashboards', NULL, 'active'),
  ('N8N', 'Workflows', NULL, 'active'),
  ('Close CRM API', 'Workflows', NULL, 'active'),
  ('Claude', 'AI/Agents', 'Managed agents, co-work', 'active'),
  ('Cloud', 'Infrastructure', 'Current', 'active'),
  ('Mac Mini + own server', 'Infrastructure', 'Planned, year-end', 'planned');
