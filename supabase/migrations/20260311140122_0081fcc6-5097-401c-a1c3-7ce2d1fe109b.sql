
-- Create table for client source materials
CREATE TABLE public.client_source_materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_profile_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  category TEXT DEFAULT 'general',
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_source_materials ENABLE ROW LEVEL SECURITY;

-- Admin/CSM/Dev/Ops can do everything
CREATE POLICY "Admin roles can manage source materials"
ON public.client_source_materials
FOR ALL
TO authenticated
USING (is_admin_role(auth.uid()))
WITH CHECK (is_admin_role(auth.uid()));

-- SDR managers can view
CREATE POLICY "SDR managers can view source materials"
ON public.client_source_materials
FOR SELECT
TO authenticated
USING (has_sdr_manager_role(auth.uid()));

-- Setters can view source materials for their assigned clients
CREATE POLICY "Setters can view source materials for assigned clients"
ON public.client_source_materials
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'setter'::app_role)
  AND EXISTS (
    SELECT 1 FROM setter_client_assignments sca
    JOIN setters_profiles sp ON sp.id = sca.setter_id
    WHERE sca.client_id = client_source_materials.client_profile_id
    AND sp.user_id = auth.uid()
    AND sca.status = 'active'
  )
);

-- Add calendly_link to client_profiles
ALTER TABLE public.client_profiles ADD COLUMN IF NOT EXISTS calendly_link TEXT;

-- Create storage bucket for source materials
INSERT INTO storage.buckets (id, name, public) VALUES ('source-materials', 'source-materials', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Admin roles can upload source materials"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'source-materials' AND is_admin_role(auth.uid())
);

CREATE POLICY "Admin roles can update source materials"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'source-materials' AND is_admin_role(auth.uid())
);

CREATE POLICY "Admin roles can delete source materials"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'source-materials' AND is_admin_role(auth.uid())
);

CREATE POLICY "Authenticated users can read source materials"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'source-materials');

-- Updated at trigger
CREATE TRIGGER update_client_source_materials_updated_at
  BEFORE UPDATE ON public.client_source_materials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
