-- Remove onboarding_complete column from client_profiles table
ALTER TABLE public.client_profiles DROP COLUMN IF EXISTS onboarding_complete;

-- Remove password_changed_from_default column as it's no longer needed
ALTER TABLE public.client_profiles DROP COLUMN IF EXISTS password_changed_from_default;