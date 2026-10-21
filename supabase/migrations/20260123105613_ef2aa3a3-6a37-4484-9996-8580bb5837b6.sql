-- Create user_department_access table for granular department access control
CREATE TABLE public.user_department_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN ('operations', 'sales', 'accounting', 'hr')),
  created_at TIMESTAMPTZ DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, department)
);

-- Enable RLS
ALTER TABLE public.user_department_access ENABLE ROW LEVEL SECURITY;

-- Policy: Admin and Dev roles can manage all department access
CREATE POLICY "Admin/Dev can manage department access"
  ON public.user_department_access
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'dev')
    )
  );

-- Policy: Users can read their own department access
CREATE POLICY "Users can read own department access"
  ON public.user_department_access
  FOR SELECT
  USING (user_id = auth.uid());

-- Add index for faster lookups
CREATE INDEX idx_user_department_access_user_id ON public.user_department_access(user_id);

-- Create a function to get default departments for a role
CREATE OR REPLACE FUNCTION public.get_default_departments_for_role(role_name TEXT)
RETURNS TEXT[] AS $$
BEGIN
  CASE role_name
    WHEN 'admin' THEN RETURN ARRAY['operations', 'sales', 'accounting', 'hr'];
    WHEN 'dev' THEN RETURN ARRAY['operations', 'sales', 'accounting', 'hr'];
    WHEN 'ops' THEN RETURN ARRAY['operations', 'sales', 'accounting', 'hr'];
    WHEN 'csm' THEN RETURN ARRAY['operations'];
    WHEN 'account_executive' THEN RETURN ARRAY['sales'];
    WHEN 'finance' THEN RETURN ARRAY['accounting'];
    WHEN 'accounting' THEN RETURN ARRAY['accounting'];
    WHEN 'hr' THEN RETURN ARRAY['hr'];
    WHEN 'setter' THEN RETURN ARRAY['operations'];
    ELSE RETURN ARRAY['operations'];
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;