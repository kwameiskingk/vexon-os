-- Create client_onboarding_stages table
CREATE TABLE public.client_onboarding_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  current_stage INTEGER DEFAULT 1 CHECK (current_stage >= 1 AND current_stage <= 6),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  assigned_csm_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(client_profile_id)
);

-- Create client_onboarding_tasks table
CREATE TABLE public.client_onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_onboarding_id UUID NOT NULL REFERENCES public.client_onboarding_stages(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  task_key TEXT NOT NULL,
  task_label TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(client_onboarding_id, task_key)
);

-- Enable RLS
ALTER TABLE public.client_onboarding_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_onboarding_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_onboarding_stages
CREATE POLICY "Admin roles can manage onboarding stages"
  ON public.client_onboarding_stages
  FOR ALL
  USING (public.is_admin_role(auth.uid()))
  WITH CHECK (public.is_admin_role(auth.uid()));

-- RLS policies for client_onboarding_tasks
CREATE POLICY "Admin roles can manage onboarding tasks"
  ON public.client_onboarding_tasks
  FOR ALL
  USING (public.is_admin_role(auth.uid()))
  WITH CHECK (public.is_admin_role(auth.uid()));

-- Create updated_at trigger for stages
CREATE TRIGGER update_onboarding_stages_updated_at
  BEFORE UPDATE ON public.client_onboarding_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();