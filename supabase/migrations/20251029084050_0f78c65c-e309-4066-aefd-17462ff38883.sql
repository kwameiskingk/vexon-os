-- Create storage bucket for invoices
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false);

-- Create storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false);

-- Create payments table
CREATE TABLE public.client_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_url TEXT,
  proof_of_payment_url TEXT,
  payment_date DATE,
  next_payment_date DATE,
  amount DECIMAL(10, 2),
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_payments
CREATE POLICY "Admins can manage all payments"
ON public.client_payments
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their own payments"
ON public.client_payments
FOR SELECT
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND client_id IN (
    SELECT id FROM public.clients WHERE email = (
      SELECT email FROM public.profiles WHERE id = auth.uid()
    )
  )
);

-- Storage policies for invoices bucket
CREATE POLICY "Admins can upload invoices"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'invoices' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can view all invoices"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoices' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Clients can view their invoices"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoices'
  AND has_role(auth.uid(), 'client'::app_role)
);

CREATE POLICY "Admins can delete invoices"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'invoices' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Storage policies for payment-proofs bucket
CREATE POLICY "Admins can upload payment proofs"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'payment-proofs' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can view all payment proofs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-proofs' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Clients can view their payment proofs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-proofs'
  AND has_role(auth.uid(), 'client'::app_role)
);

CREATE POLICY "Admins can delete payment proofs"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'payment-proofs' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Create trigger to auto-update next_payment_date
CREATE OR REPLACE FUNCTION public.set_next_payment_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_date IS NOT NULL THEN
    NEW.next_payment_date := NEW.payment_date + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_next_payment_date
BEFORE INSERT OR UPDATE ON public.client_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_next_payment_date();

-- Create trigger for updated_at
CREATE TRIGGER update_client_payments_updated_at
BEFORE UPDATE ON public.client_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();