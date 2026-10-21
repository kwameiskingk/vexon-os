-- Drop old performance_history if it exists and recreate with proper schema
DROP TABLE IF EXISTS public.performance_history CASCADE;

-- Modify performance table to ensure it has user_id and email
ALTER TABLE public.performance
ADD COLUMN IF NOT EXISTS user_id TEXT,
ADD COLUMN IF NOT EXISTS email TEXT;

-- Update existing performance rows to populate user_id and email from setters_profiles
UPDATE public.performance p
SET 
  user_id = COALESCE(p.user_id, sp.user_id::text),
  email = COALESCE(p.email, sp.email)
FROM public.setters_profiles sp
WHERE p.setter_id = sp.user_id AND (p.user_id IS NULL OR p.email IS NULL);

-- Create performance_history table with identical schema to performance
CREATE TABLE public.performance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  setter_id UUID NOT NULL,
  date DATE NOT NULL,
  dials_made INTEGER DEFAULT 0,
  talk_time INTEGER DEFAULT 0,
  warm_leads INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,
  leaderboard_rank INTEGER,
  conversations INTEGER DEFAULT 0,
  sat_meetings INTEGER DEFAULT 0,
  conversion_rate NUMERIC DEFAULT 0.00,
  dials_target INTEGER DEFAULT 1000,
  meetings_target INTEGER DEFAULT 70,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Enable RLS on performance_history
ALTER TABLE public.performance_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for performance_history
CREATE POLICY "Admins can manage performance history"
  ON public.performance_history
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Setters can view their own performance history"
  ON public.performance_history
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- Create index for faster lookups
CREATE INDEX idx_performance_history_user_date ON public.performance_history(user_id, date);
CREATE INDEX idx_performance_history_date ON public.performance_history(date);