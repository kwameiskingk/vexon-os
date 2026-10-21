-- Add contract term and payment cycle fields to accounting_records
ALTER TABLE public.accounting_records 
ADD COLUMN IF NOT EXISTS contract_term_months integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS payments_completed integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS paid_in_full boolean DEFAULT false;

-- Add health override to client_profiles
ALTER TABLE public.client_profiles
ADD COLUMN IF NOT EXISTS health_override text CHECK (health_override IN ('healthy', 'at_risk'));

-- Update the set_next_payment_date function to handle 30-day cycles
CREATE OR REPLACE FUNCTION public.set_next_payment_date()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate next payment due based on first_payment_date and payments_completed
  IF NEW.first_payment_date IS NOT NULL THEN
    NEW.next_payment_due := NEW.first_payment_date + ((COALESCE(NEW.payments_completed, 0) + 1) * INTERVAL '30 days');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;