-- 1) Allow all admin-level roles to manage candidate CV uploads
-- Replace old has_role(..., 'admin') based policies with is_admin_role()
DROP POLICY IF EXISTS "Admins can view CVs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload CVs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete CVs" ON storage.objects;

CREATE POLICY "Admin roles can view candidate CVs"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'candidate-cvs' AND is_admin_role(auth.uid()));

CREATE POLICY "Admin roles can upload candidate CVs"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'candidate-cvs' AND is_admin_role(auth.uid()));

CREATE POLICY "Admin roles can delete candidate CVs"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'candidate-cvs' AND is_admin_role(auth.uid()));

-- 2) Remove the restrictive country check constraint so Country can be free text
ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_country_check;