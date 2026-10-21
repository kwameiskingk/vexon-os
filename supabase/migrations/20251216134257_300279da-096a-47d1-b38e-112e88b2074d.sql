-- Fix RLS so all admin-level roles (dev/admin/ops/finance/csm/account_executive) can read/manage client_profile_users
-- This is required for accurate "Account Active" detection and client assignment flows.

DROP POLICY IF EXISTS "Admins can manage client profile users" ON public.client_profile_users;

CREATE POLICY "Admin roles can manage client profile users"
ON public.client_profile_users
FOR ALL
USING (is_admin_role(auth.uid()))
WITH CHECK (is_admin_role(auth.uid()));
