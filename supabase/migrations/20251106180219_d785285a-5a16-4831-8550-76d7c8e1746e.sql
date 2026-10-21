-- Create agreement_send_queue table for Sales Hub
CREATE TABLE IF NOT EXISTS public.agreement_send_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  discovery_log_id UUID REFERENCES public.sales_discovery_logs(id) ON DELETE SET NULL,
  client_first_name TEXT NOT NULL,
  client_last_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  contract_value NUMERIC,
  contract_term TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.agreement_send_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins can manage agreement queue
CREATE POLICY "Admins can manage all agreement queue entries"
ON public.agreement_send_queue
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_agreement_send_queue_updated_at
BEFORE UPDATE ON public.agreement_send_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();