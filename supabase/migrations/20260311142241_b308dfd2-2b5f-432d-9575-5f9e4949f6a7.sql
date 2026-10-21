
DROP POLICY IF EXISTS "Setters can view source materials for assigned clients" ON public.client_source_materials;

CREATE POLICY "Setters can view source materials for assigned clients"
ON public.client_source_materials
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'setter'::app_role)
  AND (
    -- Via long-term assignment
    EXISTS (
      SELECT 1
      FROM setter_client_assignments sca
      JOIN setters_profiles sp ON sp.id = sca.setter_id
      WHERE sca.client_id = client_source_materials.client_profile_id
        AND sp.user_id = auth.uid()
        AND sca.status = 'active'
    )
    OR
    -- Via roster entry (current week)
    EXISTS (
      SELECT 1
      FROM roster_entries re
      JOIN setters_profiles sp ON sp.id = re.setter_profile_id
      WHERE re.client_profile_id = client_source_materials.client_profile_id
        AND sp.user_id = auth.uid()
        AND re.roster_date >= (date_trunc('week', CURRENT_DATE))::date
        AND re.roster_date <= (date_trunc('week', CURRENT_DATE) + interval '6 days')::date
    )
  )
);
