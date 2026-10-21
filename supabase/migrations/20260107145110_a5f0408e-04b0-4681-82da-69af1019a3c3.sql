-- 1. Fix payment_history RLS to use is_admin_role
DROP POLICY IF EXISTS "Admins can manage payment history" ON public.payment_history;

CREATE POLICY "Admin roles can manage payment history"
ON public.payment_history
FOR ALL
USING (is_admin_role(auth.uid()))
WITH CHECK (is_admin_role(auth.uid()));

-- 2. Create function to sync payment_installments → accounting_records
CREATE OR REPLACE FUNCTION public.sync_accounting_record_from_installments()
RETURNS TRIGGER AS $$
DECLARE
  v_record_id uuid;
  v_payments_completed integer;
  v_contract_term integer;
  v_paid_in_full boolean;
  v_next_payment_due date;
  v_new_status payment_status;
BEGIN
  -- Get the accounting_record_id from the affected row
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.accounting_record_id;
  ELSE
    v_record_id := NEW.accounting_record_id;
  END IF;

  -- Count paid installments
  SELECT COUNT(*) INTO v_payments_completed
  FROM public.payment_installments
  WHERE accounting_record_id = v_record_id AND status = 'paid';

  -- Get contract term (default 1 if null)
  SELECT COALESCE(contract_term_months, 1) INTO v_contract_term
  FROM public.accounting_records
  WHERE id = v_record_id;

  -- Determine if paid in full
  v_paid_in_full := v_payments_completed >= v_contract_term;

  -- Get next payment due (effective due = COALESCE(deferral_end_date, due_date))
  SELECT MIN(COALESCE(deferral_end_date, due_date)) INTO v_next_payment_due
  FROM public.payment_installments
  WHERE accounting_record_id = v_record_id
    AND status NOT IN ('paid', 'written_off');

  -- Determine status
  IF v_paid_in_full THEN
    v_new_status := 'paid';
  ELSIF v_next_payment_due < CURRENT_DATE THEN
    v_new_status := 'overdue';
  ELSE
    v_new_status := 'due';
  END IF;

  -- Update the accounting record
  UPDATE public.accounting_records
  SET 
    payments_completed = v_payments_completed,
    paid_in_full = v_paid_in_full,
    next_payment_due = v_next_payment_due,
    status = v_new_status,
    updated_at = now()
  WHERE id = v_record_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Create trigger on payment_installments
DROP TRIGGER IF EXISTS sync_accounting_after_installment_change ON public.payment_installments;

CREATE TRIGGER sync_accounting_after_installment_change
AFTER INSERT OR UPDATE OR DELETE ON public.payment_installments
FOR EACH ROW
EXECUTE FUNCTION public.sync_accounting_record_from_installments();

-- 4. Backfill existing accounting_records from their installments
DO $$
DECLARE
  rec RECORD;
  v_payments_completed integer;
  v_paid_in_full boolean;
  v_next_payment_due date;
  v_new_status payment_status;
BEGIN
  FOR rec IN 
    SELECT DISTINCT ar.id, COALESCE(ar.contract_term_months, 1) as contract_term
    FROM public.accounting_records ar
    WHERE EXISTS (SELECT 1 FROM public.payment_installments pi WHERE pi.accounting_record_id = ar.id)
  LOOP
    -- Count paid
    SELECT COUNT(*) INTO v_payments_completed
    FROM public.payment_installments
    WHERE accounting_record_id = rec.id AND status = 'paid';

    v_paid_in_full := v_payments_completed >= rec.contract_term;

    -- Next due
    SELECT MIN(COALESCE(deferral_end_date, due_date)) INTO v_next_payment_due
    FROM public.payment_installments
    WHERE accounting_record_id = rec.id
      AND status NOT IN ('paid', 'written_off');

    -- Status
    IF v_paid_in_full THEN
      v_new_status := 'paid';
    ELSIF v_next_payment_due IS NOT NULL AND v_next_payment_due < CURRENT_DATE THEN
      v_new_status := 'overdue';
    ELSE
      v_new_status := 'due';
    END IF;

    UPDATE public.accounting_records
    SET 
      payments_completed = v_payments_completed,
      paid_in_full = v_paid_in_full,
      next_payment_due = v_next_payment_due,
      status = v_new_status,
      updated_at = now()
    WHERE id = rec.id;
  END LOOP;
END $$;