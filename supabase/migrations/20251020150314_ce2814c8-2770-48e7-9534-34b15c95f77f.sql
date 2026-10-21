-- Drop the old RLS policy that checks client_id
DROP POLICY IF EXISTS "Clients can view approved meetings" ON public.meetings;

-- Create new RLS policy that checks client_profile_id instead
CREATE POLICY "Clients can view their assigned meetings"
ON public.meetings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND approved_by_admin = true 
  AND client_profile_id IN (
    SELECT id 
    FROM public.client_profiles 
    WHERE user_id = auth.uid()
  )
);

-- Also update the client update policy to use client_profile_id
DROP POLICY IF EXISTS "Clients can update meeting status" ON public.meetings;

CREATE POLICY "Clients can update their assigned meetings"
ON public.meetings
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND approved_by_admin = true
  AND client_profile_id IN (
    SELECT id 
    FROM public.client_profiles 
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role)
  AND approved_by_admin = true
);