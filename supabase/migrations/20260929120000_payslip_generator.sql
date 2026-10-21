-- Payslip generator (29 Sep 2026, Elena's ask): Vexon OS replaces PaySlipper.
-- employee_payslips (Jan 2026) only ever held uploaded PDFs, keyed on a
-- setter profile. The generator keys on the auth user (so AEs, ops and any
-- staff without a setter profile can have a slip), stores the lines it was
-- built from, and records the send.
--
-- Safe to run twice. No RLS change: the existing is_hr_role() policies
-- (admin, dev, ops, hr) already cover Elena (ops) and the payslips bucket.

ALTER TABLE public.employee_payslips
  ADD COLUMN IF NOT EXISTS employee_name   text,
  ADD COLUMN IF NOT EXISTS employee_email  text,
  ADD COLUMN IF NOT EXISTS designation     text,
  ADD COLUMN IF NOT EXISTS currency        text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS pay_date        date,
  ADD COLUMN IF NOT EXISTS base_salary     numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission      numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonuses         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deductions      jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bonuses_total   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deductions_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_pay         numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS sent_at         timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to         text,
  ADD COLUMN IF NOT EXISTS payslip_no      text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_payslips_currency_check'
  ) THEN
    ALTER TABLE public.employee_payslips
      ADD CONSTRAINT employee_payslips_currency_check CHECK (currency IN ('USD', 'GBP'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_payslips_status_check'
  ) THEN
    ALTER TABLE public.employee_payslips
      ADD CONSTRAINT employee_payslips_status_check CHECK (status IN ('draft', 'sent'));
  END IF;
END $$;

-- Human-readable reference on the slip, e.g. MSP-2026-09-0007.
CREATE SEQUENCE IF NOT EXISTS public.employee_payslips_no_seq;

CREATE OR REPLACE FUNCTION public.set_payslip_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.payslip_no IS NULL THEN
    NEW.payslip_no := 'MSP-' || NEW.year || '-' || lpad(NEW.month::text, 2, '0') || '-' ||
      lpad(nextval('public.employee_payslips_no_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_payslip_no ON public.employee_payslips;
CREATE TRIGGER set_payslip_no
BEFORE INSERT ON public.employee_payslips
FOR EACH ROW EXECUTE FUNCTION public.set_payslip_no();

CREATE INDEX IF NOT EXISTS employee_payslips_user_period_idx
  ON public.employee_payslips (user_id, year DESC, month DESC);

-- Verification
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'employee_payslips'
  AND column_name IN ('employee_name','currency','base_salary','deductions','net_pay','status','sent_at','payslip_no')
ORDER BY column_name;
