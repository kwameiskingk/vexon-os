-- Add rivalry reward tracking to setters_profiles
ALTER TABLE setters_profiles 
ADD COLUMN IF NOT EXISTS rivalry_reward_amount NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rivalry_reward_type TEXT DEFAULT 'cash',
ADD COLUMN IF NOT EXISTS rivalry_end_date DATE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rivalry_reward_set_by UUID DEFAULT NULL;

-- Add rivalry winner tracking
ALTER TABLE setters_profiles
ADD COLUMN IF NOT EXISTS last_rivalry_winner_email TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_rivalry_ended_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;