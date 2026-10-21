
-- ========== Capability system ==========
CREATE TABLE IF NOT EXISTS public.role_capabilities (
  role public.app_role NOT NULL,
  capability text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, capability)
);
GRANT SELECT ON public.role_capabilities TO authenticated;
GRANT ALL ON public.role_capabilities TO service_role;
ALTER TABLE public.role_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Role caps readable by authenticated" ON public.role_capabilities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Role caps admin/dev write" ON public.role_capabilities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'));

CREATE TABLE IF NOT EXISTS public.user_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  capability text NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, capability)
);
GRANT SELECT ON public.user_capabilities TO authenticated;
GRANT ALL ON public.user_capabilities TO service_role;
ALTER TABLE public.user_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User caps readable by authenticated" ON public.user_capabilities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "User caps admin/dev write" ON public.user_capabilities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'));

CREATE OR REPLACE FUNCTION public.has_capability(_user_id uuid, _cap text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_capabilities WHERE user_id = _user_id AND capability = _cap
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_capabilities rc ON rc.role = ur.role
    WHERE ur.user_id = _user_id AND rc.capability = _cap
  );
$$;

-- Seed role capabilities
INSERT INTO public.role_capabilities (role, capability) VALUES
  ('admin','can_manage_goals'),
  ('admin','can_view_ceo_dashboard'),
  ('dev','can_view_ceo_dashboard'),
  ('dev','can_manage_goals')
ON CONFLICT DO NOTHING;

-- Seed Elena user capability if profile exists
INSERT INTO public.user_capabilities (user_id, capability, granted_by)
SELECT p.id, 'can_view_ceo_dashboard', p.id
FROM public.profiles p
WHERE lower(p.email) = 'elena@meridiansales.example'
ON CONFLICT DO NOTHING;

-- Marcus explicit grant (belt & braces)
INSERT INTO public.user_capabilities (user_id, capability, granted_by)
VALUES ('a59995b2-0ecd-4aa0-8698-a8399d4423dd','can_view_ceo_dashboard',
        'a59995b2-0ecd-4aa0-8698-a8399d4423dd')
ON CONFLICT DO NOTHING;

-- ========== performance_goals ==========
CREATE TABLE IF NOT EXISTS public.performance_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_type text NOT NULL CHECK (role_type IN ('setter','ae')),
  metric text NOT NULL CHECK (metric IN ('booked_meetings','cash_collected')),
  month date NOT NULL,
  monthly_target numeric NOT NULL CHECK (monthly_target > 0),
  set_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, metric, month)
);

CREATE OR REPLACE FUNCTION public.enforce_month_first_day()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.month := date_trunc('month', NEW.month)::date;
  RETURN NEW;
END;
$$;

CREATE TRIGGER performance_goals_month_first
BEFORE INSERT OR UPDATE ON public.performance_goals
FOR EACH ROW EXECUTE FUNCTION public.enforce_month_first_day();

CREATE TRIGGER performance_goals_updated_at
BEFORE UPDATE ON public.performance_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_goals TO authenticated;
GRANT ALL ON public.performance_goals TO service_role;
ALTER TABLE public.performance_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Goals readable by leadership" ON public.performance_goals
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'dev')
    OR public.has_role(auth.uid(),'ops')
    OR public.has_role(auth.uid(),'sdr_manager')
    OR public.has_role(auth.uid(),'csm')
    OR public.has_capability(auth.uid(),'can_view_ceo_dashboard')
  );

CREATE POLICY "Goals writable by can_manage_goals" ON public.performance_goals
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(),'can_manage_goals'))
  WITH CHECK (public.has_capability(auth.uid(),'can_manage_goals'));

-- ========== goal_settings ==========
CREATE TABLE IF NOT EXISTS public.goal_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_daily_dials int NOT NULL DEFAULT 100,
  min_daily_talk_minutes int NOT NULL DEFAULT 60,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.goal_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.goal_settings TO authenticated;
GRANT ALL ON public.goal_settings TO service_role;
ALTER TABLE public.goal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Goal settings readable by leadership" ON public.goal_settings
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'dev')
    OR public.has_role(auth.uid(),'ops')
    OR public.has_role(auth.uid(),'sdr_manager')
    OR public.has_role(auth.uid(),'csm')
    OR public.has_capability(auth.uid(),'can_view_ceo_dashboard')
  );

CREATE POLICY "Goal settings writable by can_manage_goals" ON public.goal_settings
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(),'can_manage_goals'))
  WITH CHECK (public.has_capability(auth.uid(),'can_manage_goals'));
