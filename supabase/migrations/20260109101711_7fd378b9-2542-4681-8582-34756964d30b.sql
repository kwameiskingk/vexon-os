-- Drop the restrictive policies that only check for 'admin' role
DROP POLICY IF EXISTS "Admins can upload client logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update client logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete client logos" ON storage.objects;

-- Create new policies using is_admin_role() function for all admin-level roles
CREATE POLICY "Admin roles can upload client logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-logos' 
  AND is_admin_role(auth.uid())
);

CREATE POLICY "Admin roles can update client logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'client-logos' 
  AND is_admin_role(auth.uid())
)
WITH CHECK (
  bucket_id = 'client-logos' 
  AND is_admin_role(auth.uid())
);

CREATE POLICY "Admin roles can delete client logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'client-logos' 
  AND is_admin_role(auth.uid())
);