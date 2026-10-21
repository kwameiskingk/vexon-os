
-- Midday reports table
CREATE TABLE IF NOT EXISTS public.midday_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  start_of_day_id uuid REFERENCES public.start_of_day_submissions(id) ON DELETE SET NULL,
  mood text,
  on_track text CHECK (on_track IN ('yes','partially','no')),
  blockers text,
  dials_count integer,
  talk_time_minutes integer,
  connects_count integer,
  meetings_booked integer,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_at_uk timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_midday_reports_user_date ON public.midday_reports (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_midday_reports_date ON public.midday_reports (date DESC);

ALTER TABLE public.midday_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own midday report"
  ON public.midday_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own midday report"
  ON public.midday_reports FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own + managers view all midday reports"
  ON public.midday_reports FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'ops'::app_role)
    OR public.has_role(auth.uid(), 'csm'::app_role)
    OR public.has_sdr_manager_role(auth.uid())
  );

CREATE TRIGGER update_midday_reports_updated_at
  BEFORE UPDATE ON public.midday_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Midday report settings (mirrors hourly_update_settings shape)
CREATE TABLE IF NOT EXISTS public.midday_report_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT false,
  target_roles text[] NOT NULL DEFAULT ARRAY['setter']::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

INSERT INTO public.midday_report_settings (enabled, target_roles)
SELECT false, ARRAY['setter']::text[]
WHERE NOT EXISTS (SELECT 1 FROM public.midday_report_settings);

ALTER TABLE public.midday_report_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read midday report settings"
  ON public.midday_report_settings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'ops'::app_role)
    OR public.has_role(auth.uid(), 'csm'::app_role)
    OR public.has_sdr_manager_role(auth.uid())
    OR public.has_role(auth.uid(), 'setter'::app_role)
    OR public.has_role(auth.uid(), 'account_executive'::app_role)
    OR public.has_role(auth.uid(), 'gtm_engineer'::app_role)
  );

CREATE POLICY "Write midday report settings"
  ON public.midday_report_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role));

CREATE TRIGGER update_midday_report_settings_updated_at
  BEFORE UPDATE ON public.midday_report_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Drop old hourly task auto-completion trigger (we are removing the hourly form)
DROP TRIGGER IF EXISTS tg_complete_hourly_task ON public.hourly_updates;
