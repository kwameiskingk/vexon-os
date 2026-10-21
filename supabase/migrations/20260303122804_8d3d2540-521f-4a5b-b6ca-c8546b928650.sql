
-- Allow setters to read their own roster entries
CREATE POLICY "Setters can view own roster entries"
ON public.roster_entries
FOR SELECT
USING (
  setter_profile_id IN (
    SELECT id FROM public.setters_profiles WHERE user_id = auth.uid()
  )
);

-- Allow admins/devs/ops to manage roster entries and clients
CREATE POLICY "Admins can manage roster entries"
ON public.roster_entries
FOR ALL
USING (public.is_admin_role(auth.uid()));

CREATE POLICY "Admins can manage roster clients"
ON public.roster_clients
FOR ALL
USING (public.is_admin_role(auth.uid()));
