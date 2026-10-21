-- Create daily_metrics table for Google Sheet ingestion
CREATE TABLE IF NOT EXISTS public.daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_id UUID NOT NULL,
  department TEXT NOT NULL,
  date DATE NOT NULL,
  calls INTEGER DEFAULT 0,
  conversations INTEGER DEFAULT 0,
  meetings INTEGER DEFAULT 0,
  showups INTEGER DEFAULT 0,
  warm_leads INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(setter_id, date)
);

-- Create meeting_logs table for morning and EOD entries
CREATE TABLE IF NOT EXISTS public.meeting_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_id UUID NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  meeting_type TEXT NOT NULL CHECK (meeting_type IN ('morning', 'eod')),
  date DATE NOT NULL,
  goal TEXT,
  blocker TEXT,
  achieved BOOLEAN,
  reason_not_achieved TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for daily_metrics
CREATE POLICY "Admins can manage daily_metrics"
ON public.daily_metrics
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Setters can view their own daily_metrics"
ON public.daily_metrics
FOR SELECT
TO authenticated
USING (
  setter_id IN (
    SELECT id FROM public.setters_profiles WHERE user_id = auth.uid()
  )
);

-- RLS Policies for meeting_logs
CREATE POLICY "Admins can manage meeting_logs"
ON public.meeting_logs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Setters can view their own meeting_logs"
ON public.meeting_logs
FOR SELECT
TO authenticated
USING (
  setter_id IN (
    SELECT id FROM public.setters_profiles WHERE user_id = auth.uid()
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_metrics_setter_date ON public.daily_metrics(setter_id, date);
CREATE INDEX IF NOT EXISTS idx_meeting_logs_setter_date ON public.meeting_logs(setter_id, date, meeting_type);

-- Add trigger for updated_at
CREATE TRIGGER update_daily_metrics_updated_at
  BEFORE UPDATE ON public.daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_meeting_logs_updated_at
  BEFORE UPDATE ON public.meeting_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();