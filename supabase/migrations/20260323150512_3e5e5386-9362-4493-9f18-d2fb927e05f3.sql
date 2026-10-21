
-- Drop old restrictive policies
DROP POLICY IF EXISTS "Admins can upload invoices" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all invoices" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete invoices" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete payment proofs" ON storage.objects;

-- Recreate with is_admin_role() which includes admin, dev, ops, finance, csm, account_executive
CREATE POLICY "Admin roles can upload invoices" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices' AND is_admin_role(auth.uid()));

CREATE POLICY "Admin roles can view invoices" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'invoices' AND is_admin_role(auth.uid()));

CREATE POLICY "Admin roles can delete invoices" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'invoices' AND is_admin_role(auth.uid()));

CREATE POLICY "Admin roles can upload payment proofs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND is_admin_role(auth.uid()));

CREATE POLICY "Admin roles can view payment proofs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND is_admin_role(auth.uid()));

CREATE POLICY "Admin roles can delete payment proofs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'payment-proofs' AND is_admin_role(auth.uid()));

-- Keep client view policies as-is
