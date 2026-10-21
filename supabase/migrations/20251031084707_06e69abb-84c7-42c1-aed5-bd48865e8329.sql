-- Remove NOT NULL constraint from user_id in client_profiles
-- This allows admin to create client profiles without requiring a linked auth user
ALTER TABLE public.client_profiles 
ALTER COLUMN user_id DROP NOT NULL;