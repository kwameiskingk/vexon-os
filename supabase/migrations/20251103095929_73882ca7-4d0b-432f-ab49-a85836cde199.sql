-- Add auth_user_id and onboarded columns to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS onboarded boolean DEFAULT false;