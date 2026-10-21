-- Allow Tom (special Cold Outbound user) to read GTM HeyReach data
CREATE POLICY "Tom can read heyreach events"
ON public.gtm_heyreach_events
FOR SELECT
TO authenticated
USING (auth.uid() = '42292222-46a0-4b2c-85b8-ecf3fca6415b'::uuid);

CREATE POLICY "Tom can read heyreach campaign metrics"
ON public.gtm_campaign_metrics
FOR SELECT
TO authenticated
USING (auth.uid() = '42292222-46a0-4b2c-85b8-ecf3fca6415b'::uuid);
