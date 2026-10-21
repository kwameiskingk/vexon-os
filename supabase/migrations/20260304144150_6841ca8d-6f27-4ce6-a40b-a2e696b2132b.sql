-- Allow setters to read heyreach events they were notified about
CREATE POLICY "Setters can read events linked to their notifications"
ON public.gtm_heyreach_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'setter'
  )
  AND EXISTS (
    SELECT 1 FROM notifications
    WHERE notifications.recipient_id = auth.uid()
    AND notifications.link_url = '/setter/heyreach-reply/' || gtm_heyreach_events.id::text
  )
);