-- Create enum for payment status
CREATE TYPE payment_status AS ENUM ('paid', 'due', 'overdue', 'partial');

-- Create enum for payment methods
CREATE TYPE payment_method_type AS ENUM ('iwoca', 'stripe', 'direct_transfer', 'whop', 'other');

-- Create accounting_records table (new source of truth for billing)
CREATE TABLE public.accounting_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  
  -- Invoice details
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_url TEXT,
  
  -- Payment details
  amount NUMERIC(10, 2) NOT NULL,
  payment_method payment_method_type NOT NULL DEFAULT 'other',
  first_payment_date DATE,
  next_payment_due DATE,
  status payment_status NOT NULL DEFAULT 'due',
  
  -- Contact emails
  primary_email TEXT,
  accounts_email TEXT,
  
  -- Supporting documents
  proof_url TEXT,
  
  -- Notes and metadata
  notes TEXT,
  
  -- Computed metrics (updated via triggers or application)
  average_payment_delay_days INTEGER DEFAULT 0,
  total_lifetime_value NUMERIC(10, 2) DEFAULT 0,
  on_time_payment_rate NUMERIC(5, 2) DEFAULT 100.00,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create partial_payments table for tracking installments
CREATE TABLE public.partial_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_record_id UUID NOT NULL REFERENCES public.accounting_records(id) ON DELETE CASCADE,
  
  amount NUMERIC(10, 2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method payment_method_type,
  proof_url TEXT,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create invoice_audit_log for tracking all changes
CREATE TABLE public.invoice_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_record_id UUID NOT NULL REFERENCES public.accounting_records(id) ON DELETE CASCADE,
  
  action TEXT NOT NULL, -- 'created', 'sent', 'edited', 'payment_received', 'status_changed'
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  details JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create sequence for invoice numbering
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1;

-- Function to generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'MSP-INV-' || LPAD(nextval('invoice_number_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate invoice numbers
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_invoice_number
BEFORE INSERT ON public.accounting_records
FOR EACH ROW
EXECUTE FUNCTION set_invoice_number();

-- Trigger to update updated_at timestamp
CREATE TRIGGER trigger_update_accounting_records_timestamp
BEFORE UPDATE ON public.accounting_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.accounting_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partial_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for accounting_records
CREATE POLICY "Admins can manage all accounting records"
ON public.accounting_records
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for partial_payments
CREATE POLICY "Admins can manage all partial payments"
ON public.partial_payments
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for invoice_audit_log
CREATE POLICY "Admins can view audit logs"
ON public.invoice_audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert audit logs"
ON public.invoice_audit_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Migrate data from accounting_cards to accounting_records
INSERT INTO public.accounting_records (
  client_profile_id,
  invoice_number,
  amount,
  payment_method,
  first_payment_date,
  next_payment_due,
  status,
  notes,
  created_at,
  updated_at
)
SELECT 
  client_id,
  generate_invoice_number(),
  COALESCE(contract_value, 0),
  CASE 
    WHEN LOWER(payment_type) LIKE '%iwoca%' THEN 'iwoca'::payment_method_type
    WHEN LOWER(payment_type) LIKE '%stripe%' THEN 'stripe'::payment_method_type
    WHEN LOWER(payment_type) LIKE '%whop%' THEN 'whop'::payment_method_type
    WHEN LOWER(payment_type) LIKE '%direct%' OR LOWER(payment_type) LIKE '%transfer%' THEN 'direct_transfer'::payment_method_type
    ELSE 'other'::payment_method_type
  END,
  renewal_date,
  next_payment_due,
  CASE 
    WHEN invoice_status = 'missed' THEN 'overdue'::payment_status
    WHEN next_payment_due < CURRENT_DATE THEN 'overdue'::payment_status
    WHEN next_payment_due <= CURRENT_DATE + INTERVAL '1 day' THEN 'due'::payment_status
    ELSE 'paid'::payment_status
  END,
  internal_notes,
  created_at,
  updated_at
FROM public.accounting_cards
WHERE client_id IS NOT NULL;

-- Create indexes for performance
CREATE INDEX idx_accounting_records_client ON public.accounting_records(client_profile_id);
CREATE INDEX idx_accounting_records_status ON public.accounting_records(status);
CREATE INDEX idx_accounting_records_next_due ON public.accounting_records(next_payment_due);
CREATE INDEX idx_partial_payments_record ON public.partial_payments(accounting_record_id);
CREATE INDEX idx_invoice_audit_log_record ON public.invoice_audit_log(accounting_record_id);

-- Comment on tables
COMMENT ON TABLE public.accounting_records IS 'Primary billing and invoicing records for client profiles';
COMMENT ON TABLE public.partial_payments IS 'Tracks partial/installment payments for invoices';
COMMENT ON TABLE public.invoice_audit_log IS 'Audit trail for all invoice-related actions';