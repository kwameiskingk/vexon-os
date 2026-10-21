-- Create table for manual AE metrics overrides
CREATE TABLE ae_metrics_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ae_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_discovery INTEGER DEFAULT 0,
  qualified_discovery INTEGER DEFAULT 0,
  no_shows INTEGER DEFAULT 0,
  lead_followups INTEGER DEFAULT 0,
  total_closes INTEGER DEFAULT 0,
  contract_value NUMERIC(10,2) DEFAULT 0,
  cash_collected NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ae_user_id, period_start, period_end)
);

-- Enable RLS
ALTER TABLE ae_metrics_overrides ENABLE ROW LEVEL SECURITY;

-- Only dev/admin/ops can manage AE overrides
CREATE POLICY "Admins can manage AE overrides" ON ae_metrics_overrides
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('dev', 'admin', 'ops')
    )
  );

-- Create updated_at trigger
CREATE TRIGGER update_ae_metrics_overrides_updated_at
  BEFORE UPDATE ON ae_metrics_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();