-- Fix Keagan's account: Assign sdr_manager role
INSERT INTO user_roles (user_id, role)
VALUES ('50fa30ea-62cc-4313-800c-42d4061c858f', 'sdr_manager')
ON CONFLICT (user_id, role) DO NOTHING;

-- Assign department access for Keagan (operations and sales)
INSERT INTO user_department_access (user_id, department)
VALUES 
  ('50fa30ea-62cc-4313-800c-42d4061c858f', 'operations'),
  ('50fa30ea-62cc-4313-800c-42d4061c858f', 'sales')
ON CONFLICT DO NOTHING;

-- Update RLS policies on user_roles to include dev role

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;

-- Create updated policies that include dev role
CREATE POLICY "Admins and devs can insert roles"
ON user_roles FOR INSERT
TO public
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role)
);

CREATE POLICY "Admins and devs can update roles"
ON user_roles FOR UPDATE
TO public
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role)
);

CREATE POLICY "Admins and devs can delete roles"
ON user_roles FOR DELETE
TO public
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role)
);