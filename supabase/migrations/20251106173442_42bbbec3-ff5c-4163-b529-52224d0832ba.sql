-- Create accounting_cards table
CREATE TABLE public.accounting_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  payment_method TEXT CHECK (payment_method IN ('iwoca', 'manual', 'other')),
  contract_value NUMERIC,
  paid_in_full BOOLEAN DEFAULT false,
  next_invoice_date DATE,
  renewal_date DATE,
  internal_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.accounting_cards ENABLE ROW LEVEL SECURITY;

-- RLS policies for accounting_cards
CREATE POLICY "Admins can manage all accounting cards"
ON public.accounting_cards
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create sales_discovery_logs table
CREATE TABLE public.sales_discovery_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  meeting_at TIMESTAMP WITH TIME ZONE NOT NULL,
  attendance_confirmed BOOLEAN DEFAULT false,
  outcome TEXT CHECK (outcome IN ('interested', 'unsure', 'not_interested')),
  notes TEXT,
  fathom_url TEXT,
  contract_value NUMERIC,
  contract_term TEXT,
  sent_contract_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_discovery_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for sales_discovery_logs
CREATE POLICY "Admins can manage all discovery logs"
ON public.sales_discovery_logs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create admin_feedback_entries table
CREATE TABLE public.admin_feedback_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  eod_text TEXT,
  internal_notes_thread JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_feedback_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_feedback_entries
CREATE POLICY "Admins can manage all feedback entries"
ON public.admin_feedback_entries
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger for accounting_cards
CREATE TRIGGER update_accounting_cards_updated_at
BEFORE UPDATE ON public.accounting_cards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add updated_at trigger for sales_discovery_logs
CREATE TRIGGER update_sales_discovery_logs_updated_at
BEFORE UPDATE ON public.sales_discovery_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add updated_at trigger for admin_feedback_entries
CREATE TRIGGER update_admin_feedback_entries_updated_at
BEFORE UPDATE ON public.admin_feedback_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();