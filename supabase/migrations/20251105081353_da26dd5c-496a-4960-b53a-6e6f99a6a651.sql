-- Create a public storage bucket for client logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for client logos bucket
CREATE POLICY "Admins can upload client logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-logos' AND
  (SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ))
);

CREATE POLICY "Admins can update client logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-logos' AND
  (SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ))
);

CREATE POLICY "Admins can delete client logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-logos' AND
  (SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ))
);

CREATE POLICY "Client logos are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'client-logos');