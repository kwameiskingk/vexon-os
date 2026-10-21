-- Create achievement_definitions table
CREATE TABLE public.achievement_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('streak', 'quantity', 'quality', 'improvement', 'milestone')),
  tier TEXT CHECK (tier IS NULL OR tier IN ('bronze', 'silver', 'gold')),
  target_role TEXT NOT NULL CHECK (target_role IN ('setter', 'account_executive', 'csm', 'ops', 'all')),
  target_department TEXT CHECK (target_department IS NULL OR target_department IN ('fulfilment', 'acquisition')),
  is_permanent BOOLEAN DEFAULT false,
  reset_period TEXT CHECK (reset_period IS NULL OR reset_period IN ('weekly', 'monthly')),
  criteria JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create user_achievement_progress table
CREATE TABLE public.user_achievement_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  achievement_definition_id UUID REFERENCES public.achievement_definitions(id) ON DELETE CASCADE NOT NULL,
  current_progress NUMERIC DEFAULT 0,
  target_value NUMERIC NOT NULL,
  progress_pct NUMERIC GENERATED ALWAYS AS (
    CASE WHEN target_value > 0 THEN LEAST((current_progress / target_value) * 100, 100) ELSE 0 END
  ) STORED,
  last_updated TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, achievement_definition_id)
);

-- Modify leaderboard_achievements table
ALTER TABLE public.leaderboard_achievements 
ADD COLUMN IF NOT EXISTS achievement_definition_id UUID REFERENCES public.achievement_definitions(id),
ADD COLUMN IF NOT EXISTS tier TEXT,
ADD COLUMN IF NOT EXISTS month_awarded DATE,
ADD COLUMN IF NOT EXISTS progress_snapshot JSONB;

-- Modify setters_profiles table with custom targets
ALTER TABLE public.setters_profiles
ADD COLUMN IF NOT EXISTS daily_dials_target INTEGER DEFAULT 150,
ADD COLUMN IF NOT EXISTS daily_meetings_target INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS daily_talk_time_target INTEGER DEFAULT 120;

-- Enable RLS on new tables
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievement_progress ENABLE ROW LEVEL SECURITY;

-- RLS policies for achievement_definitions (viewable by all authenticated, editable by admins)
CREATE POLICY "Anyone authenticated can view achievement definitions"
ON public.achievement_definitions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage achievement definitions"
ON public.achievement_definitions
FOR ALL
TO authenticated
USING (public.is_admin_role(auth.uid()))
WITH CHECK (public.is_admin_role(auth.uid()));

-- RLS policies for user_achievement_progress (users see their own, admins see all)
CREATE POLICY "Users can view their own achievement progress"
ON public.user_achievement_progress
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin_role(auth.uid()));

CREATE POLICY "System can manage all achievement progress"
ON public.user_achievement_progress
FOR ALL
TO authenticated
USING (public.is_admin_role(auth.uid()))
WITH CHECK (public.is_admin_role(auth.uid()));

-- Create updated_at trigger for achievement_definitions
CREATE TRIGGER update_achievement_definitions_updated_at
BEFORE UPDATE ON public.achievement_definitions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();