-- Update the sync function to also update installment status when deferred becomes overdue
CREATE OR REPLACE FUNCTION public.sync_accounting_record_from_installments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- First, update any deferred installments that are now past their deferral_end_date to 'pending'
  -- so they can be properly evaluated as overdue
  UPDATE public.payment_installments
  SET status = 'pending', is_deferred = false
  WHERE accounting_record_id = v_record_id
    AND status = 'deferred'
    AND is_deferred = true
    AND deferral_end_date IS NOT NULL
    AND deferral_end_date < CURRENT_DATE;

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
$function$;