
-- Fix corrupted auth record for owner@meridiansales.example

-- Step 1: Remove foreign key constraint blocking deletion
UPDATE meetings 
SET approved_by = NULL 
WHERE approved_by = 'a7e06d33-655f-46e4-8222-ed4ac7b9cdf3';

-- Step 2: Delete existing records in reverse dependency order
DELETE FROM user_roles WHERE user_id = 'a7e06d33-655f-46e4-8222-ed4ac7b9cdf3';
DELETE FROM setters_profiles WHERE user_id = 'a7e06d33-655f-46e4-8222-ed4ac7b9cdf3';
DELETE FROM profiles WHERE id = 'a7e06d33-655f-46e4-8222-ed4ac7b9cdf3';

-- Note: The auth.users record will be deleted via Supabase admin API after this migration
