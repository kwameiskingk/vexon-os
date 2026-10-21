-- Create enums for manual_daily_metrics
CREATE TYPE public.metrics_target_role AS ENUM ('setter', 'account_executive', 'sdr_manager', 'ops');
CREATE TYPE public.metrics_department AS ENUM ('acquisition', 'fulfilment');
CREATE TYPE public.mismatch_flag_type AS ENUM ('none', 'input_higher', 'app_higher');

-- Create the manual_daily_metrics table
CREATE TABLE public.manual_daily_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  target_user_id UUID NOT NULL,
  target_role metrics_target_role NOT NULL,
  department metrics_department NOT NULL,
  entered_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Setter fields
  dials INTEGER,
  talk_time_minutes INTEGER,
  conversations INTEGER,
  warm_leads INTEGER,
  meetings_booked_input INTEGER,
  meetings_booked_app INTEGER,
  mismatch_flag mismatch_flag_type DEFAULT 'none',
  mismatch_notified BOOLEAN DEFAULT false,

  -- AE fields
  cash_collected NUMERIC,
  deals_closed INTEGER,
  discoveries_scheduled INTEGER,
  discoveries_set INTEGER,
  disco_show_rate NUMERIC,
  closing_calls_booked INTEGER,
  disco_to_closing_pct NUMERIC,
  closing_calls_scheduled INTEGER,
  closing_calls_set INTEGER,
  close_rate_pct NUMERIC,
  ae_dials INTEGER,
  prospects_reactivated INTEGER,

  -- SDR Manager fields
  training_sessions_booked INTEGER,
  team_dials INTEGER,
  team_talk_time INTEGER,
  team_conversations INTEGER,
  team_warm_leads INTEGER,
  team_meetings_booked INTEGER,

  -- Ops/HR fields
  trial_calls_scheduled INTEGER,
  trial_calls_set INTEGER,
  invited_to_interview INTEGER,
  set_to_interview_pct NUMERIC,
  candidate_dials INTEGER,
  candidates_screened INTEGER,
  new_trial_calls_booked INTEGER,
  sdrs_hired INTEGER,

  -- Critical constraint: one record per person per role per day
  CONSTRAINT unique_daily_metric UNIQUE (date, target_user_id, target_role)
);

-- Enable RLS
ALTER TABLE public.manual_daily_metrics ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE TRIGGER update_manual_daily_metrics_updated_at
  BEFORE UPDATE ON public.manual_daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: check if user is ops_assistant
CREATE OR REPLACE FUNCTION public.is_ops_assistant(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'ops_assistant'
  )
$$;

-- RLS Policies

-- SELECT: admin, dev, ops, ops_assistant, csm can read
CREATE POLICY "Authorized roles can read manual_daily_metrics"
  ON public.manual_daily_metrics
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR public.is_ops_assistant(auth.uid())
    OR (public.has_role(auth.uid(), 'csm') AND department = 'fulfilment')
  );

-- INSERT: ops_assistant can insert any, csm can insert fulfilment only
CREATE POLICY "Ops assistant can insert manual_daily_metrics"
  ON public.manual_daily_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.is_ops_assistant(auth.uid()) AND entered_by = auth.uid())
    OR (public.has_role(auth.uid(), 'csm') AND department = 'fulfilment' AND entered_by = auth.uid())
  );

-- UPDATE: ops_assistant can update any, csm can update fulfilment only
CREATE POLICY "Ops assistant can update manual_daily_metrics"
  ON public.manual_daily_metrics
  FOR UPDATE
  TO authenticated
  USING (
    public.is_ops_assistant(auth.uid())
    OR (public.has_role(auth.uid(), 'csm') AND department = 'fulfilment')
  )
  WITH CHECK (
    (public.is_ops_assistant(auth.uid()) AND entered_by = auth.uid())
    OR (public.has_role(auth.uid(), 'csm') AND department = 'fulfilment' AND entered_by = auth.uid())
  );