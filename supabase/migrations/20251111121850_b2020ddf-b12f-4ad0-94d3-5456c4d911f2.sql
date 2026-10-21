-- Step 1: Ensure client_profiles has all required fields
ALTER TABLE public.client_profiles 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS size text,
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Step 2: Create client_profile_users join table
CREATE TABLE IF NOT EXISTS public.client_profile_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'client_user',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_profile_id, user_id)
);

-- Enable RLS on client_profile_users
ALTER TABLE public.client_profile_users ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_profile_users
CREATE POLICY "Admins can manage client profile users"
  ON public.client_profile_users
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own client profile associations"
  ON public.client_profile_users
  FOR SELECT
  USING (auth.uid() = user_id);

-- Step 3: Migrate all data from clients to client_profiles
INSERT INTO public.client_profiles (
  id,
  company_name,
  contact_name,
  email,
  phone,
  website,
  industry,
  size,
  country,
  logo,
  team_network_member,
  status,
  created_at,
  updated_at
)
SELECT 
  id,
  company_name,
  contact_name,
  email,
  mobile,
  company_website,
  industry,
  company_size,
  country,
  logo,
  team_network_member,
  'active'::client_profile_status,
  created_at,
  updated_at
FROM public.clients
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  contact_name = EXCLUDED.contact_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  website = EXCLUDED.website,
  industry = EXCLUDED.industry,
  size = EXCLUDED.size,
  country = EXCLUDED.country,
  logo = EXCLUDED.logo,
  team_network_member = EXCLUDED.team_network_member,
  updated_at = EXCLUDED.updated_at;

-- Migrate existing user associations from clients to client_profile_users
INSERT INTO public.client_profile_users (client_profile_id, user_id, role)
SELECT id, auth_user_id, 'client_user'
FROM public.clients
WHERE auth_user_id IS NOT NULL
ON CONFLICT (client_profile_id, user_id) DO NOTHING;