
-- Add receipt_url column to accounting_records
ALTER TABLE public.accounting_records ADD COLUMN IF NOT EXISTS receipt_url text;

-- Create receipts storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Admin roles can upload/view/delete receipts
CREATE POLICY "Admin roles can upload receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND is_admin_role(auth.uid()));

CREATE POLICY "Admin roles can view receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND is_admin_role(auth.uid()));

CREATE POLICY "Admin roles can delete receipts" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND is_admin_role(auth.uid()));

-- Clients can view their own receipts (file path starts with their client_profile_id)
CREATE POLICY "Clients can view own receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts' AND (
      -- Check if file path starts with a client_profile_id the user owns
      EXISTS (
        SELECT 1 FROM client_profile_users cpu
        WHERE cpu.user_id = auth.uid()
        AND (storage.foldername(name))[1] = cpu.client_profile_id::text
      )
      OR EXISTS (
        SELECT 1 FROM client_profiles cp
        WHERE cp.user_id = auth.uid()
        AND (storage.foldername(name))[1] = cp.id::text
      )
    )
  );
