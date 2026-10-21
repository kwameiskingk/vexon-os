-- Fix storage policies to scope client access to their own files only
-- Drop existing overly permissive client policies
DROP POLICY IF EXISTS "Clients can view their invoices" ON storage.objects;
DROP POLICY IF EXISTS "Clients can view their payment proofs" ON storage.objects;

-- Create scoped policies that check file path matches client_id
-- Clients can only view invoices in their own folder (path: {client_id}/*)
CREATE POLICY "Clients can view their own invoices only"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoices'
  AND has_role(auth.uid(), 'client'::app_role)
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM public.clients 
    WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    LIMIT 1
  )
);

-- Clients can only view payment proofs in their own folder
CREATE POLICY "Clients can view their own payment proofs only"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-proofs'
  AND has_role(auth.uid(), 'client'::app_role)
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM public.clients 
    WHERE email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    LIMIT 1
  )
);