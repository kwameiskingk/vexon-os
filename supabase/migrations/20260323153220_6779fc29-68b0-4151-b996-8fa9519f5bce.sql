
-- Create a standalone client_receipts table
CREATE TABLE public.client_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_receipts ENABLE ROW LEVEL SECURITY;

-- Admins can manage
CREATE POLICY "Admin roles can manage client receipts"
ON public.client_receipts FOR ALL TO authenticated
USING (is_admin_role(auth.uid()))
WITH CHECK (is_admin_role(auth.uid()));

-- Clients can view their own
CREATE POLICY "Clients can view own receipts"
ON public.client_receipts FOR SELECT TO authenticated
USING (
  client_profile_id IN (
    SELECT client_profile_id FROM public.client_profile_users WHERE user_id = auth.uid()
    UNION
    SELECT id FROM public.client_profiles WHERE user_id = auth.uid()
  )
);
