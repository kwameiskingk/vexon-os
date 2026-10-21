DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_profiles'
      AND policyname = 'Setters can view rostered client profiles'
  ) THEN
    CREATE POLICY "Setters can view rostered client profiles"
    ON public.client_profiles
    FOR SELECT
    USING (
      id IN (
        SELECT re.client_profile_id
        FROM public.roster_entries re
        JOIN public.setters_profiles sp ON sp.id = re.setter_profile_id
        WHERE sp.user_id = auth.uid()
      )
    );
  END IF;
END $$;