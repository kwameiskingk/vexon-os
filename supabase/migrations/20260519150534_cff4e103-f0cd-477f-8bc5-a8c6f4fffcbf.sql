
CREATE POLICY "Accounting can insert invoices"
ON public.invoice_submissions
FOR INSERT
TO authenticated
WITH CHECK (is_accounting_role(auth.uid()) OR has_role(auth.uid(), 'csm'::app_role));

CREATE POLICY "Accounting can delete invoices"
ON public.invoice_submissions
FOR DELETE
TO authenticated
USING (is_accounting_role(auth.uid()) OR has_role(auth.uid(), 'csm'::app_role));
