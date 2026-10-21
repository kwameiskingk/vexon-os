-- Client onboarding flow settings (8 Sep 2026): flow-level media that has no
-- card to live on. First use: the "onboarding complete" video Daniel recorded
-- for the finish screen ("You are all set"), which is not a client_flow_steps
-- row. One row, id = 1. Any signed-in user may read it (clients watch it);
-- onboarding staff (dev/admin/ops/csm — the client_flow_steps writers) edit
-- it from the flow builder. Media lives in the onboarding-media bucket like
-- every other card video. Safe to run twice.

CREATE TABLE IF NOT EXISTS public.client_flow_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  finish_video_path text,
  finish_video_url text,
  finish_thumbnail_path text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.client_flow_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.client_flow_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users read client flow settings" ON public.client_flow_settings;
CREATE POLICY "Signed-in users read client flow settings"
  ON public.client_flow_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Onboarding staff manage client flow settings" ON public.client_flow_settings;
CREATE POLICY "Onboarding staff manage client flow settings"
  ON public.client_flow_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'dev'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'ops'::public.app_role) OR public.has_role(auth.uid(),'csm'::public.app_role));

notify pgrst, 'reload schema';
