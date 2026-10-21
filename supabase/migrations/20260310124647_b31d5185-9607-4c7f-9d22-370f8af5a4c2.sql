
-- Employee Offboarding Pipeline
CREATE TABLE public.employee_offboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  employee_email TEXT,
  stage TEXT NOT NULL DEFAULT 'exit_interview',
  reason TEXT,
  notes TEXT,
  initiated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.employee_offboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offboarding_id UUID REFERENCES public.employee_offboarding(id) ON DELETE CASCADE NOT NULL,
  stage TEXT NOT NULL,
  task_key TEXT NOT NULL,
  task_label TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Client Offboarding Pipeline
CREATE TABLE public.client_offboarding_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id UUID REFERENCES public.client_profiles(id) ON DELETE CASCADE NOT NULL,
  current_stage INT NOT NULL DEFAULT 1,
  reason TEXT,
  assigned_csm_id UUID,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.client_offboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_offboarding_id UUID REFERENCES public.client_offboarding_stages(id) ON DELETE CASCADE NOT NULL,
  stage INT NOT NULL,
  task_key TEXT NOT NULL,
  task_label TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_offboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_offboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_offboarding_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_offboarding_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies - admin/dev/ops/hr/csm can manage
CREATE POLICY "Admin roles can manage employee offboarding" ON public.employee_offboarding
  FOR ALL TO authenticated USING (public.is_admin_role(auth.uid()) OR public.is_hr_role(auth.uid()));

CREATE POLICY "Admin roles can manage employee offboarding tasks" ON public.employee_offboarding_tasks
  FOR ALL TO authenticated USING (public.is_admin_role(auth.uid()) OR public.is_hr_role(auth.uid()));

CREATE POLICY "Admin roles can manage client offboarding" ON public.client_offboarding_stages
  FOR ALL TO authenticated USING (public.is_admin_role(auth.uid()));

CREATE POLICY "Admin roles can manage client offboarding tasks" ON public.client_offboarding_tasks
  FOR ALL TO authenticated USING (public.is_admin_role(auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_employee_offboarding_updated_at
  BEFORE UPDATE ON public.employee_offboarding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_client_offboarding_updated_at
  BEFORE UPDATE ON public.client_offboarding_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
