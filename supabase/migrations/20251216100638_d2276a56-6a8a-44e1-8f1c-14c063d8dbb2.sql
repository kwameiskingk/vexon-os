-- Fix admin_activity_log RLS policies to use is_admin_role for all admin-level roles

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can insert activity logs" ON public.admin_activity_log;
DROP POLICY IF EXISTS "Admins can view activity logs" ON public.admin_activity_log;

-- Create new permissive policies using is_admin_role
CREATE POLICY "Admin roles can insert activity logs" 
ON public.admin_activity_log 
FOR INSERT 
WITH CHECK (is_admin_role(auth.uid()));

CREATE POLICY "Admin roles can view activity logs" 
ON public.admin_activity_log 
FOR SELECT 
USING (is_admin_role(auth.uid()));