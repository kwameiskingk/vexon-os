-- Client invoices (9 Oct 2026). Marcus's ask on the 8 Oct EOD call: raise and
-- send the Meridian invoice PDF from the dashboard instead of copying his Google
-- Doc template by hand (about ten minutes per close).
--
-- The never-used public.invoices table is EXTENDED rather than replaced: it
-- already points at client_profiles, its status list (draft/sent/paid/overdue/
-- cancelled) is the one we want, and CEO → Finance already reads it for cash
-- paid / outstanding / overdue. One table, one source of truth.
--
-- Money columns: `amount` stays the NET figure (ex VAT) so it lines up with
-- the rest of the dashboard's ex-VAT cash numbers; `total_amount` is what the
-- client actually pays. All writes come through the client-invoices edge
-- function (service role); browser-side policies only widen READ access so
-- Daniel (csm) and the AE can see whether an invoice is out and paid.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS bill_to_name text,
  ADD COLUMN IF NOT EXISTS bill_to_address text,
  ADD COLUMN IF NOT EXISTS line_description text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS sent_to text,
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resend_email_id text,
  ADD COLUMN IF NOT EXISTS paid_marked_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.invoices.amount IS 'Net of VAT (matches the dashboard''s ex-VAT cash figures). total_amount is what the client pays.';
COMMENT ON COLUMN public.invoices.invoice_number IS 'Marcus''s scheme: the issue date backwards (YYYY/MM/DD), with -2, -3… when more than one is raised the same day.';

-- One number per invoice. Nothing exists in the table yet, so this cannot fail.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_key ON public.invoices (invoice_number);
CREATE INDEX IF NOT EXISTS invoices_client_id_idx ON public.invoices (client_id);

-- Remembered per client so the next invoice is pre-filled.
ALTER TABLE public.client_profiles ADD COLUMN IF NOT EXISTS billing_address text;

-- Reads: the admin tier (admin, dev, ops, finance, csm, account_executive) —
-- is_admin_role() — instead of the accounting tier only. Writes are unchanged
-- (accounting tier direct, everyone else through the edge function).
DROP POLICY IF EXISTS "Accounting roles can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admin tier can view invoices" ON public.invoices;
CREATE POLICY "Admin tier can view invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (public.is_admin_role(auth.uid()));

-- updated_at: the existing update_invoices_updated_at trigger already covers it.
