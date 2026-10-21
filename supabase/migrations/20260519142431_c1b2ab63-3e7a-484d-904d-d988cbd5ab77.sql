
-- 1. Add payroll fields to setters_profiles
ALTER TABLE public.setters_profiles
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS home_address text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS account_holder_name text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS sort_code text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS swift_bic text,
  ADD COLUMN IF NOT EXISTS bank_country text,
  ADD COLUMN IF NOT EXISTS bank_address text;

ALTER TABLE public.setters_profiles
  DROP CONSTRAINT IF EXISTS setters_profiles_currency_check;
ALTER TABLE public.setters_profiles
  ADD CONSTRAINT setters_profiles_currency_check CHECK (currency IN ('USD','GBP'));

-- 2. Extend invoice_submissions for admin-driven compile flow
ALTER TABLE public.invoice_submissions
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS base_salary numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sat_meetings_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sat_source text,
  ADD COLUMN IF NOT EXISTS tiered_bonus_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiered_bonus_tier integer,
  ADD COLUMN IF NOT EXISTS custom_bonuses jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deductions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deductions_total numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cycle_compiled_at timestamptz,
  ADD COLUMN IF NOT EXISTS compiled_by uuid;

-- Allow new 'compiled' status
ALTER TABLE public.invoice_submissions
  DROP CONSTRAINT IF EXISTS invoice_submissions_status_check;
ALTER TABLE public.invoice_submissions
  ADD CONSTRAINT invoice_submissions_status_check
  CHECK (status IN ('submitted','compiled','approved','rejected','paid'));

-- 3. payroll_cycles audit table
CREATE TABLE IF NOT EXISTS public.payroll_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  department text NOT NULL DEFAULT 'fulfilment',
  closed_by uuid NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  grand_total_by_currency jsonb DEFAULT '{}'::jsonb,
  setter_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_cycles_period ON public.payroll_cycles (department, period_start, period_end);

ALTER TABLE public.payroll_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounting staff can view payroll cycles" ON public.payroll_cycles;
CREATE POLICY "Accounting staff can view payroll cycles"
  ON public.payroll_cycles FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'accounting'::app_role)
  );

DROP POLICY IF EXISTS "Accounting staff can insert payroll cycles" ON public.payroll_cycles;
CREATE POLICY "Accounting staff can insert payroll cycles"
  ON public.payroll_cycles FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'accounting'::app_role)
  );
