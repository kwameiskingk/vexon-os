
-- Add candidate_id, target_role, target_department to employee_onboarding
ALTER TABLE public.employee_onboarding 
  ADD COLUMN IF NOT EXISTS candidate_id uuid REFERENCES public.candidates(id),
  ADD COLUMN IF NOT EXISTS candidate_name text,
  ADD COLUMN IF NOT EXISTS candidate_email text,
  ADD COLUMN IF NOT EXISTS target_role text,
  ADD COLUMN IF NOT EXISTS target_department text;

-- Update the default stage to 'screening'
ALTER TABLE public.employee_onboarding ALTER COLUMN stage SET DEFAULT 'screening';

-- Add 'in_onboarding' to candidates status options (text column, no enum needed)
-- We just need to be able to set status = 'in_onboarding'

-- Create employee_onboarding_tasks for checklist items per stage  
CREATE TABLE IF NOT EXISTS public.employee_onboarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.employee_onboarding(id) ON DELETE CASCADE,
  stage text NOT NULL,
  task_key text NOT NULL,
  task_label text NOT NULL,
  is_completed boolean DEFAULT false,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.employee_onboarding_tasks ENABLE ROW LEVEL SECURITY;

-- RLS: HR roles can manage onboarding tasks
CREATE POLICY "HR roles can manage employee onboarding tasks"
  ON public.employee_onboarding_tasks
  FOR ALL
  TO authenticated
  USING (public.is_hr_role(auth.uid()))
  WITH CHECK (public.is_hr_role(auth.uid()));

-- RLS for employee_onboarding (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'employee_onboarding' AND policyname = 'HR roles can manage employee onboarding'
  ) THEN
    CREATE POLICY "HR roles can manage employee onboarding"
      ON public.employee_onboarding
      FOR ALL
      TO authenticated
      USING (public.is_hr_role(auth.uid()))
      WITH CHECK (public.is_hr_role(auth.uid()));
  END IF;
END $$;
