
-- Cache of Close call transcripts, fetched on demand
CREATE TABLE public.call_transcripts (
  call_id TEXT PRIMARY KEY,
  department TEXT,
  transcript JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read transcripts"
  ON public.call_transcripts FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'sdr_manager'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
  );

-- AI-generated coaching briefs over a setter's recent calls
CREATE TABLE public.call_review_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_profile_id UUID NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  manager_user_id UUID NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  department TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','error')),
  brief JSONB,
  error TEXT,
  call_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_review_briefs_setter ON public.call_review_briefs(setter_profile_id, created_at DESC);

ALTER TABLE public.call_review_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read briefs"
  ON public.call_review_briefs FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'sdr_manager'::app_role)
    OR has_role(auth.uid(), 'csm'::app_role)
  );

CREATE POLICY "Managers and admins can insert briefs"
  ON public.call_review_briefs FOR INSERT
  WITH CHECK (
    manager_user_id = auth.uid() AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dev'::app_role)
      OR has_role(auth.uid(), 'sdr_manager'::app_role)
    )
  );

-- Realtime so the UI can subscribe to brief status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_review_briefs;
ALTER TABLE public.call_review_briefs REPLICA IDENTITY FULL;
