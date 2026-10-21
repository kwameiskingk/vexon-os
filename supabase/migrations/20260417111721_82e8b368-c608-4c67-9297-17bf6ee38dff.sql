
CREATE TABLE public.morning_team_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL CHECK (department IN ('acquisition','fulfilment')),
  goal_type text NOT NULL CHECK (goal_type IN ('weekly_meetings','monthly_cash')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  target_value numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department, goal_type, period_start)
);

ALTER TABLE public.morning_team_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View morning team goals" ON public.morning_team_goals
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers manage morning team goals - insert" ON public.morning_team_goals
FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'dev')
  OR has_role(auth.uid(),'ops') OR has_role(auth.uid(),'sdr_manager')
);

CREATE POLICY "Managers manage morning team goals - update" ON public.morning_team_goals
FOR UPDATE TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'dev')
  OR has_role(auth.uid(),'ops') OR has_role(auth.uid(),'sdr_manager')
) WITH CHECK (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'dev')
  OR has_role(auth.uid(),'ops') OR has_role(auth.uid(),'sdr_manager')
);

CREATE POLICY "Managers manage morning team goals - delete" ON public.morning_team_goals
FOR DELETE TO authenticated USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'dev')
  OR has_role(auth.uid(),'ops') OR has_role(auth.uid(),'sdr_manager')
);

CREATE TRIGGER update_morning_team_goals_updated_at
BEFORE UPDATE ON public.morning_team_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
