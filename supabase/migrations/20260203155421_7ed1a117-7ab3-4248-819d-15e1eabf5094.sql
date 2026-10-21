-- Create pip_progress_notes table for PIP tracking notes
CREATE TABLE public.pip_progress_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pip_record_id UUID NOT NULL REFERENCES public.pip_records(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pip_progress_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies - managers can view/insert notes for their PIPs
CREATE POLICY "Managers can view notes for their PIPs"
  ON public.pip_progress_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pip_records pr
      JOIN public.sdr_manager_assignments sma ON pr.setter_profile_id = sma.setter_profile_id
      WHERE pr.id = pip_progress_notes.pip_record_id
      AND sma.manager_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'dev', 'ops')
    )
  );

CREATE POLICY "Managers can insert notes for their PIPs"
  ON public.pip_progress_notes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pip_records pr
      JOIN public.sdr_manager_assignments sma ON pr.setter_profile_id = sma.setter_profile_id
      WHERE pr.id = pip_progress_notes.pip_record_id
      AND sma.manager_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'dev', 'ops')
    )
  );

-- Index for fast lookups
CREATE INDEX idx_pip_progress_notes_pip_record_id ON public.pip_progress_notes(pip_record_id);