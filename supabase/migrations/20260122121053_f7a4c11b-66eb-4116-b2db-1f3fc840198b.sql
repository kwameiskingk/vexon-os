-- Add CSM contact columns to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS csm_name TEXT DEFAULT 'Daniel',
ADD COLUMN IF NOT EXISTS csm_email TEXT DEFAULT 'daniel@meridiansales.example',
ADD COLUMN IF NOT EXISTS csm_phone TEXT,
ADD COLUMN IF NOT EXISTS csm_calendly_url TEXT DEFAULT 'https://calendly.com/daniel-vexon';

-- Add CSM notes to client column to client_profiles
ALTER TABLE public.client_profiles 
ADD COLUMN IF NOT EXISTS csm_notes_to_client TEXT;

-- Add RLS policy for clients to view their assigned warm leads
CREATE POLICY "Clients can view their assigned warm leads"
ON public.leads FOR SELECT TO authenticated
USING (
  assigned_client_id IN (
    SELECT id FROM public.client_profiles WHERE user_id = auth.uid()
    UNION
    SELECT client_profile_id FROM public.client_profile_users WHERE user_id = auth.uid()
  )
);