
-- Drop the overly permissive service role policy and replace with a more targeted one
DROP POLICY "Service role can update enrichment requests" ON public.enrichment_requests;

-- The edge function will use the service_role key which bypasses RLS entirely,
-- so we don't need this policy at all. The webhook callback edge function
-- uses createClient with service_role key which already bypasses RLS.
