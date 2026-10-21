-- Drop any existing policies on storage.objects for resource-files bucket
DROP POLICY IF EXISTS "Admin roles can upload resource files" ON storage.objects;
DROP POLICY IF EXISTS "Admin roles can update resource files" ON storage.objects;
DROP POLICY IF EXISTS "Admin roles can delete resource files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view resource files" ON storage.objects;
DROP POLICY IF EXISTS "Public can view resource files" ON storage.objects;

-- Create policy for admin roles to upload files to resource-files bucket
CREATE POLICY "Admin roles can upload resource files" 
ON storage.objects 
AS PERMISSIVE
FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'resource-files' 
  AND public.is_admin_role(auth.uid())
);

-- Create policy for admin roles to update files in resource-files bucket
CREATE POLICY "Admin roles can update resource files" 
ON storage.objects 
AS PERMISSIVE
FOR UPDATE 
TO authenticated
USING (
  bucket_id = 'resource-files' 
  AND public.is_admin_role(auth.uid())
)
WITH CHECK (
  bucket_id = 'resource-files' 
  AND public.is_admin_role(auth.uid())
);

-- Create policy for admin roles to delete files from resource-files bucket
CREATE POLICY "Admin roles can delete resource files" 
ON storage.objects 
AS PERMISSIVE
FOR DELETE 
TO authenticated
USING (
  bucket_id = 'resource-files' 
  AND public.is_admin_role(auth.uid())
);

-- Create policy for anyone to view/download resource files (public bucket)
CREATE POLICY "Anyone can view resource files" 
ON storage.objects 
AS PERMISSIVE
FOR SELECT 
TO public
USING (bucket_id = 'resource-files');