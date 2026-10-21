-- Tom Reilly read access to remaining HeyReach + Smartlead tables so the
-- /cold-outbound/* surfaces show the same data as /gtm/*.

CREATE POLICY "Tom can read gtm_sender_accounts"
ON public.gtm_sender_accounts FOR SELECT
USING (auth.uid() = '42292222-46a0-4b2c-85b8-ecf3fca6415b'::uuid);

CREATE POLICY "Tom can read gtm_smartlead_campaign_metrics"
ON public.gtm_smartlead_campaign_metrics FOR SELECT
USING (auth.uid() = '42292222-46a0-4b2c-85b8-ecf3fca6415b'::uuid);

CREATE POLICY "Tom can read gtm_smartlead_sender_accounts"
ON public.gtm_smartlead_sender_accounts FOR SELECT
USING (auth.uid() = '42292222-46a0-4b2c-85b8-ecf3fca6415b'::uuid);

CREATE POLICY "Tom can read gtm_smartlead_events"
ON public.gtm_smartlead_events FOR SELECT
USING (auth.uid() = '42292222-46a0-4b2c-85b8-ecf3fca6415b'::uuid);

CREATE POLICY "Tom can read smartlead_reply_actions"
ON public.smartlead_reply_actions FOR SELECT
USING (auth.uid() = '42292222-46a0-4b2c-85b8-ecf3fca6415b'::uuid);

CREATE POLICY "Tom can insert smartlead_reply_actions"
ON public.smartlead_reply_actions FOR INSERT
WITH CHECK (auth.uid() = '42292222-46a0-4b2c-85b8-ecf3fca6415b'::uuid);