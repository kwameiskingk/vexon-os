
-- 1. Extend pitch_calls with cash collected + PIF + special agreements
ALTER TABLE public.pitch_calls
  ADD COLUMN IF NOT EXISTS cash_collected NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pif BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pif_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS special_agreements TEXT,
  ADD COLUMN IF NOT EXISTS closed_on DATE;

-- 2. Add base_salary to profiles for non-setter/AE roles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS base_salary NUMERIC DEFAULT 0;

-- 3. AE deal payments (installments)
CREATE TABLE IF NOT EXISTS public.ae_deal_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_call_id UUID NOT NULL REFERENCES public.pitch_calls(id) ON DELETE CASCADE,
  ae_user_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  installment_index INTEGER,
  note TEXT,
  auto_generated BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ae_deal_payments_pitch_call ON public.ae_deal_payments(pitch_call_id);
CREATE INDEX IF NOT EXISTS idx_ae_deal_payments_ae_user ON public.ae_deal_payments(ae_user_id);
CREATE INDEX IF NOT EXISTS idx_ae_deal_payments_paid_on ON public.ae_deal_payments(paid_on);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ae_deal_payments TO authenticated;
GRANT ALL ON public.ae_deal_payments TO service_role;

ALTER TABLE public.ae_deal_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AE can view own payments" ON public.ae_deal_payments
  FOR SELECT USING (auth.uid() = ae_user_id OR public.is_admin_role(auth.uid()) OR public.is_accounting_role(auth.uid()));

CREATE POLICY "AE and admin can insert payments" ON public.ae_deal_payments
  FOR INSERT WITH CHECK (auth.uid() = ae_user_id OR public.is_admin_role(auth.uid()) OR public.is_accounting_role(auth.uid()));

CREATE POLICY "AE and admin can update payments" ON public.ae_deal_payments
  FOR UPDATE USING (auth.uid() = ae_user_id OR public.is_admin_role(auth.uid()) OR public.is_accounting_role(auth.uid()));

CREATE POLICY "Admin can delete payments" ON public.ae_deal_payments
  FOR DELETE USING (public.is_admin_role(auth.uid()) OR public.is_accounting_role(auth.uid()));

CREATE TRIGGER update_ae_deal_payments_updated_at BEFORE UPDATE ON public.ae_deal_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Keep pitch_calls.cash_collected in sync as sum of payments
CREATE OR REPLACE FUNCTION public.sync_pitch_call_cash_collected()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pitch_call_id UUID;
  v_total NUMERIC;
BEGIN
  v_pitch_call_id := COALESCE(NEW.pitch_call_id, OLD.pitch_call_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM public.ae_deal_payments WHERE pitch_call_id = v_pitch_call_id;
  UPDATE public.pitch_calls SET cash_collected = v_total, updated_at = now()
    WHERE id = v_pitch_call_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_sync_pitch_call_cash_collected ON public.ae_deal_payments;
CREATE TRIGGER tg_sync_pitch_call_cash_collected
  AFTER INSERT OR UPDATE OR DELETE ON public.ae_deal_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_pitch_call_cash_collected();

-- 4. Employee custom bonuses (for all roles)
CREATE TABLE IF NOT EXISTS public.employee_custom_bonuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cycle_start DATE NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_custom_bonuses_user ON public.employee_custom_bonuses(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_custom_bonuses_cycle ON public.employee_custom_bonuses(cycle_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_custom_bonuses TO authenticated;
GRANT ALL ON public.employee_custom_bonuses TO service_role;

ALTER TABLE public.employee_custom_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their own bonuses" ON public.employee_custom_bonuses
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin_role(auth.uid()) OR public.is_hr_role(auth.uid()) OR public.is_accounting_role(auth.uid()));

CREATE POLICY "Admin/HR/Finance can insert bonuses" ON public.employee_custom_bonuses
  FOR INSERT WITH CHECK (public.is_admin_role(auth.uid()) OR public.is_hr_role(auth.uid()) OR public.is_accounting_role(auth.uid()));

CREATE POLICY "Admin/HR/Finance can update bonuses" ON public.employee_custom_bonuses
  FOR UPDATE USING (public.is_admin_role(auth.uid()) OR public.is_hr_role(auth.uid()) OR public.is_accounting_role(auth.uid()));

CREATE POLICY "Admin/HR/Finance can delete bonuses" ON public.employee_custom_bonuses
  FOR DELETE USING (public.is_admin_role(auth.uid()) OR public.is_hr_role(auth.uid()) OR public.is_accounting_role(auth.uid()));

CREATE TRIGGER update_employee_custom_bonuses_updated_at BEFORE UPDATE ON public.employee_custom_bonuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
