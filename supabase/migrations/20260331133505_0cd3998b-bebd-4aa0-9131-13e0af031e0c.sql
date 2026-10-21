
CREATE TABLE public.client_catchups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_profile_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL DEFAULT '10:00:00',
  summary TEXT,
  action_points TEXT[] DEFAULT '{}',
  fathom_link TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_by UUID NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  notification_2d_sent BOOLEAN DEFAULT false,
  notification_1d_sent BOOLEAN DEFAULT false,
  notification_day_sent BOOLEAN DEFAULT false,
  notification_1h_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_catchups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view client catchups"
  ON public.client_catchups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert client catchups"
  ON public.client_catchups FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update client catchups"
  ON public.client_catchups FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete client catchups"
  ON public.client_catchups FOR DELETE TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.client_catchups;
