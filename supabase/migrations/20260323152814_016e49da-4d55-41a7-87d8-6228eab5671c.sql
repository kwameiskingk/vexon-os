
CREATE POLICY "Clients can view own accounting records"
ON public.accounting_records
FOR SELECT
TO authenticated
USING (
  client_profile_id IN (
    SELECT client_profile_id FROM public.client_profile_users WHERE user_id = auth.uid()
    UNION
    SELECT id FROM public.client_profiles WHERE user_id = auth.uid()
  )
);
