-- Add rival_email field to setters_profiles table
ALTER TABLE public.setters_profiles 
ADD COLUMN IF NOT EXISTS rival_email text;

-- Add reward_type field to leaderboard_bonuses table for different reward types
ALTER TABLE public.leaderboard_bonuses 
ADD COLUMN IF NOT EXISTS reward_type text DEFAULT 'cash';

-- Add index for faster rival lookups
CREATE INDEX IF NOT EXISTS idx_setters_profiles_rival_email 
ON public.setters_profiles(rival_email);