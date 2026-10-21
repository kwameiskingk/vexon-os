-- Add missing campaign fields
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS meetings_sat integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS progress_manual_pct integer DEFAULT 0 CHECK (progress_manual_pct >= 0 AND progress_manual_pct <= 100);

-- Create client_stipulations table
CREATE TABLE IF NOT EXISTS client_stipulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date timestamp with time zone NOT NULL DEFAULT now(),
  issue text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  resolved boolean DEFAULT false,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on client_stipulations
ALTER TABLE client_stipulations ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_stipulations
CREATE POLICY "Admins can manage all stipulations"
ON client_stipulations
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at on client_stipulations
CREATE TRIGGER update_client_stipulations_updated_at
BEFORE UPDATE ON client_stipulations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_client_stipulations_client_id ON client_stipulations(client_id);
CREATE INDEX IF NOT EXISTS idx_client_stipulations_resolved ON client_stipulations(resolved);