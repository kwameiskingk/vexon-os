-- Allow SDR managers to read client_profiles for roster assignment
CREATE POLICY "SDR managers can view client profiles"
ON public.client_profiles
FOR SELECT
USING (public.has_sdr_manager_role(auth.uid()));

-- Also ensure SDR managers can read roster_clients and roster_entries
-- Check existing policies first and add if missing
CREATE POLICY "SDR managers can view all roster clients"
ON public.roster_clients
FOR SELECT
USING (public.has_sdr_manager_role(auth.uid()));

CREATE POLICY "SDR managers can insert roster clients"
ON public.roster_clients
FOR INSERT
WITH CHECK (public.has_sdr_manager_role(auth.uid()) AND manager_user_id = auth.uid());

CREATE POLICY "SDR managers can delete own roster clients"
ON public.roster_clients
FOR DELETE
USING (public.has_sdr_manager_role(auth.uid()) AND manager_user_id = auth.uid());

CREATE POLICY "SDR managers can view roster entries"
ON public.roster_entries
FOR SELECT
USING (public.has_sdr_manager_role(auth.uid()));

CREATE POLICY "SDR managers can insert roster entries"
ON public.roster_entries
FOR INSERT
WITH CHECK (public.has_sdr_manager_role(auth.uid()));

CREATE POLICY "SDR managers can delete roster entries"
ON public.roster_entries
FOR DELETE
USING (public.has_sdr_manager_role(auth.uid()));