-- Create table for storing user tab access restrictions per department
-- By default all tabs are visible; this table stores RESTRICTIONS (hidden tabs)
CREATE TABLE public.user_tab_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  hidden_tabs TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, department)
);

-- Enable RLS
ALTER TABLE public.user_tab_restrictions ENABLE ROW LEVEL SECURITY;

-- Policy for admin/dev to manage tab restrictions
CREATE POLICY "Admin and Dev can manage tab restrictions"
  ON public.user_tab_restrictions
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev')
  );

-- Policy for users to read their own restrictions
CREATE POLICY "Users can read own tab restrictions"
  ON public.user_tab_restrictions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_tab_restrictions_updated_at
  BEFORE UPDATE ON public.user_tab_restrictions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_user_tab_restrictions_user_id ON public.user_tab_restrictions(user_id);
CREATE INDEX idx_user_tab_restrictions_department ON public.user_tab_restrictions(department);