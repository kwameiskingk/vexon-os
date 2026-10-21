
-- Create hourly_updates table
CREATE TABLE public.hourly_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dials_count INTEGER NOT NULL DEFAULT 0,
  talk_time TEXT NOT NULL DEFAULT '',
  support_needed TEXT,
  hour_slot INTEGER NOT NULL CHECK (hour_slot >= 10 AND hour_slot <= 17),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date, hour_slot)
);

-- Create hourly_update_settings table (single-row config)
CREATE TABLE public.hourly_update_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  target_roles TEXT[] NOT NULL DEFAULT ARRAY['setter']::TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id)
);

-- Seed default settings row
INSERT INTO public.hourly_update_settings (enabled, target_roles) VALUES (false, ARRAY['setter']::TEXT[]);

-- Enable RLS
ALTER TABLE public.hourly_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_update_settings ENABLE ROW LEVEL SECURITY;

-- RLS for hourly_updates
CREATE POLICY "Users can insert their own hourly updates"
  ON public.hourly_updates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own hourly updates"
  ON public.hourly_updates FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'ops')
    OR public.has_role(auth.uid(), 'csm')
    OR public.has_sdr_manager_role(auth.uid())
  );

-- RLS for hourly_update_settings
CREATE POLICY "Admin and dev can read hourly update settings"
  ON public.hourly_update_settings FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'ops')
    OR public.has_role(auth.uid(), 'csm')
    OR public.has_sdr_manager_role(auth.uid())
    OR public.has_role(auth.uid(), 'setter')
  );

CREATE POLICY "Admin and dev can update hourly update settings"
  ON public.hourly_update_settings FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  );

-- Timestamps trigger
CREATE TRIGGER update_hourly_updates_updated_at
  BEFORE UPDATE ON public.hourly_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hourly_update_settings_updated_at
  BEFORE UPDATE ON public.hourly_update_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
