ALTER TABLE public.team_goals
  ADD COLUMN IF NOT EXISTS goal_metric text NOT NULL DEFAULT 'meetings_booked',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'overview';

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_goal_metric_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_goal_metric_check
  CHECK (goal_metric IN ('meetings_booked','sat_meetings'));

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_source_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_source_check
  CHECK (source IN ('overview','morning_meeting'));

CREATE UNIQUE INDEX IF NOT EXISTS team_goals_morning_sync_unique
  ON public.team_goals(department, goal_metric, start_date)
  WHERE source = 'morning_meeting' AND status = 'active';