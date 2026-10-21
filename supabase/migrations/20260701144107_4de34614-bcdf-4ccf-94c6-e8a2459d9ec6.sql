
-- Add restricted roles to system_settings
ALTER TABLE public.system_settings 
  ADD COLUMN IF NOT EXISTS maintenance_restricted_roles text[] NOT NULL DEFAULT ARRAY['admin','ops','finance','csm','hr','accounting','sdr_manager','setter','account_executive','gtm_engineer','ops_assistant','client'];

-- Enable realtime for system_settings
ALTER TABLE public.system_settings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;

-- Broadcast table
CREATE TABLE IF NOT EXISTS public.system_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  active boolean NOT NULL DEFAULT true,
  target_roles text[] NOT NULL DEFAULT ARRAY['admin','ops','finance','csm','hr','accounting','sdr_manager','setter','account_executive','gtm_engineer','ops_assistant','client','dev'],
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

GRANT SELECT ON public.system_broadcasts TO authenticated;
GRANT ALL ON public.system_broadcasts TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.system_broadcasts TO authenticated;

ALTER TABLE public.system_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read broadcasts" ON public.system_broadcasts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Dev insert broadcasts" ON public.system_broadcasts
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Dev update broadcasts" ON public.system_broadcasts
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Dev delete broadcasts" ON public.system_broadcasts
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'dev'::app_role));

ALTER TABLE public.system_broadcasts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_broadcasts;
