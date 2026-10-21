-- 1. Add timezone column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/London';

-- 2. start_of_day_settings table
CREATE TABLE IF NOT EXISTS public.start_of_day_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN NOT NULL DEFAULT true,
  target_roles TEXT[] NOT NULL DEFAULT ARRAY['setter'],
  popup_time TIME NOT NULL DEFAULT '09:30',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.start_of_day_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SoD settings readable by admin/dev/sdr_manager"
  ON public.start_of_day_settings FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'sdr_manager')
    OR public.has_role(auth.uid(), 'setter')
    OR public.has_role(auth.uid(), 'account_executive')
    OR public.has_role(auth.uid(), 'csm')
    OR public.has_role(auth.uid(), 'gtm_engineer')
  );

CREATE POLICY "SoD settings writable by admin/dev"
  ON public.start_of_day_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE TRIGGER trg_sod_settings_updated_at
  BEFORE UPDATE ON public.start_of_day_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed one row
INSERT INTO public.start_of_day_settings (enabled, target_roles, popup_time)
SELECT true, ARRAY['setter'], '09:30'::time
WHERE NOT EXISTS (SELECT 1 FROM public.start_of_day_settings);

-- 3. eod_settings table
CREATE TABLE IF NOT EXISTS public.eod_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN NOT NULL DEFAULT true,
  target_roles TEXT[] NOT NULL DEFAULT ARRAY['setter'],
  popup_time TIME NOT NULL DEFAULT '17:15',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.eod_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "EOD settings readable by all authenticated"
  ON public.eod_settings FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'sdr_manager')
    OR public.has_role(auth.uid(), 'setter')
    OR public.has_role(auth.uid(), 'account_executive')
    OR public.has_role(auth.uid(), 'csm')
    OR public.has_role(auth.uid(), 'gtm_engineer')
  );

CREATE POLICY "EOD settings writable by admin/dev"
  ON public.eod_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE TRIGGER trg_eod_settings_updated_at
  BEFORE UPDATE ON public.eod_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.eod_settings (enabled, target_roles, popup_time)
SELECT true, ARRAY['setter'], '17:15'::time
WHERE NOT EXISTS (SELECT 1 FROM public.eod_settings);

-- 4. start_of_day_submissions table
CREATE TABLE IF NOT EXISTS public.start_of_day_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  mood TEXT CHECK (mood IN ('very_unhappy','unhappy','neutral','happy','very_happy')),
  planned_activities TEXT,
  top_priorities TEXT,
  success_definition TEXT,
  blockers TEXT,
  anything_else TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  uk_submitted_at TIMESTAMPTZ,
  missed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_sod_submissions_user_date
  ON public.start_of_day_submissions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_sod_submissions_date
  ON public.start_of_day_submissions (date DESC);

ALTER TABLE public.start_of_day_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own SoD submission"
  ON public.start_of_day_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own SoD submissions"
  ON public.start_of_day_submissions FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'sdr_manager')
  );

CREATE POLICY "System and admins can insert any SoD submission"
  ON public.start_of_day_submissions FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  );

-- 5. hourly_updates submitted_at_uk
ALTER TABLE public.hourly_updates
  ADD COLUMN IF NOT EXISTS submitted_at_uk TIMESTAMPTZ;

-- 6. setter_feedback submitted_at_uk
ALTER TABLE public.setter_feedback
  ADD COLUMN IF NOT EXISTS submitted_at_uk TIMESTAMPTZ;