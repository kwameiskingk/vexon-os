-- Create sdr_daily_metrics table for SDR performance tracking
CREATE TABLE IF NOT EXISTS public.sdr_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  campaign_id UUID,
  date DATE NOT NULL,
  dials INTEGER DEFAULT 0,
  connects INTEGER DEFAULT 0,
  conversations INTEGER DEFAULT 0,
  meetings INTEGER DEFAULT 0,
  showups INTEGER DEFAULT 0,
  talk_time_minutes NUMERIC DEFAULT 0,
  client_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, date, campaign_id)
);

-- Enable RLS
ALTER TABLE public.sdr_daily_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all sdr metrics"
  ON public.sdr_daily_metrics
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Setters can view their own metrics"
  ON public.sdr_daily_metrics
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_sdr_daily_metrics_updated_at
  BEFORE UPDATE ON public.sdr_daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sdr_daily_metrics_user_id ON public.sdr_daily_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_sdr_daily_metrics_campaign_id ON public.sdr_daily_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sdr_daily_metrics_date ON public.sdr_daily_metrics(date);
CREATE INDEX IF NOT EXISTS idx_sdr_daily_metrics_client_id ON public.sdr_daily_metrics(client_id);