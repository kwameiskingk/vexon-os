
CREATE TABLE public.setter_weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  goal_metric TEXT NOT NULL CHECK (goal_metric IN ('sat_meetings','meetings_booked')),
  target_value INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setter_user_id, week_start, goal_metric)
);

CREATE INDEX idx_setter_weekly_goals_setter_week ON public.setter_weekly_goals(setter_user_id, week_start);

ALTER TABLE public.setter_weekly_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view setter weekly goals"
ON public.setter_weekly_goals FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
  OR public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'sdr_manager')
);

CREATE POLICY "Setters can view their own weekly goal"
ON public.setter_weekly_goals FOR SELECT TO authenticated
USING (setter_user_id = auth.uid());

CREATE POLICY "Managers can insert setter weekly goals"
ON public.setter_weekly_goals FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
  OR public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'sdr_manager')
);

CREATE POLICY "Managers can update setter weekly goals"
ON public.setter_weekly_goals FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
  OR public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'sdr_manager')
);

CREATE POLICY "Managers can delete setter weekly goals"
ON public.setter_weekly_goals FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
  OR public.has_role(auth.uid(), 'sdr_manager')
);

CREATE TRIGGER update_setter_weekly_goals_updated_at
BEFORE UPDATE ON public.setter_weekly_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
