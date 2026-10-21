-- Create storage bucket for resource files
INSERT INTO storage.buckets (id, name, public)
VALUES ('resource-files', 'resource-files', true);

-- Create RLS policies for resource-files bucket
CREATE POLICY "Admins can upload resource files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resource-files' AND
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "Admins can update resource files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'resource-files' AND
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "Admins can delete resource files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'resource-files' AND
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "Public can view resource files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'resource-files');

-- Add file_path column to resources table to store uploaded file paths
ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Add file_name column to store original filename
ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS file_name TEXT;