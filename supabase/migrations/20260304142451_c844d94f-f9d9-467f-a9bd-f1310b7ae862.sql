
CREATE TABLE public.heyreach_reply_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.gtm_heyreach_events(id),
  setter_user_id UUID NOT NULL,
  outcome TEXT NOT NULL,
  meeting_date DATE,
  meeting_time TEXT,
  meeting_id UUID REFERENCES public.meetings(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.heyreach_reply_actions ENABLE ROW LEVEL SECURITY;

-- Setters can read and insert their own actions
CREATE POLICY "Setters can view own reply actions"
  ON public.heyreach_reply_actions
  FOR SELECT
  TO authenticated
  USING (setter_user_id = auth.uid());

CREATE POLICY "Setters can insert own reply actions"
  ON public.heyreach_reply_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (setter_user_id = auth.uid());

-- Admins/dev/ops can view all
CREATE POLICY "Admins can view all reply actions"
  ON public.heyreach_reply_actions
  FOR SELECT
  TO authenticated
  USING (public.is_admin_role(auth.uid()) OR public.is_dev(auth.uid()));

-- GTM engineers can view all reply actions
CREATE POLICY "GTM engineers can view all reply actions"
  ON public.heyreach_reply_actions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'gtm_engineer'
    )
  );
