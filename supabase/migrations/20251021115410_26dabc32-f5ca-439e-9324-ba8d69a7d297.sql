-- Add missing columns to performance table for Close integration
ALTER TABLE public.performance 
ADD COLUMN IF NOT EXISTS talk_time integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS leaderboard_rank integer DEFAULT NULL;