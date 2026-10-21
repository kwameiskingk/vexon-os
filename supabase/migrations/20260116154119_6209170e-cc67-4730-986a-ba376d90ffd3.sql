-- Add missing FK constraint for meetings.client_profile_id
ALTER TABLE public.meetings 
ADD CONSTRAINT meetings_client_profile_id_fkey 
FOREIGN KEY (client_profile_id) REFERENCES public.client_profiles(id) ON DELETE SET NULL;