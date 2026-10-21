-- Create payment_installments table for individual monthly payment tracking
CREATE TABLE public.payment_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_record_id UUID NOT NULL REFERENCES public.accounting_records(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, partial, deferred, written_off
  paid_date DATE,
  paid_amount NUMERIC,
  is_deferred BOOLEAN DEFAULT FALSE,
  deferral_reason TEXT,
  deferral_end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;

-- Create policy for admin access
CREATE POLICY "Admin roles can manage all payment installments"
ON public.payment_installments
FOR ALL
USING (is_admin_role(auth.uid()))
WITH CHECK (is_admin_role(auth.uid()));

-- Create index for faster lookups
CREATE INDEX idx_payment_installments_record_id ON public.payment_installments(accounting_record_id);
CREATE INDEX idx_payment_installments_due_date ON public.payment_installments(due_date);
CREATE INDEX idx_payment_installments_status ON public.payment_installments(status);

-- Add trigger for updated_at
CREATE TRIGGER update_payment_installments_updated_at
BEFORE UPDATE ON public.payment_installments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for payment_installments
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_installments;