-- Add role and expanded fields to setter_feedback table
ALTER TABLE setter_feedback 
ADD COLUMN IF NOT EXISTS role text,
ADD COLUMN IF NOT EXISTS what_you_did text,
ADD COLUMN IF NOT EXISTS what_went_well text,
ADD COLUMN IF NOT EXISTS what_you_struggled_with text,
ADD COLUMN IF NOT EXISTS email text;

-- Create leaderboard_awards table for manual override controls
CREATE TABLE IF NOT EXISTS leaderboard_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('month_acquisition', 'month_fulfillment', 'month_company', 'week', 'day')),
  email text NOT NULL,
  date date NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE leaderboard_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage leaderboard awards"
ON leaderboard_awards
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can view leaderboard awards"
ON leaderboard_awards
FOR SELECT
USING (true);

-- Create leaderboard_bonuses table for bonus challenges
CREATE TABLE IF NOT EXISTS leaderboard_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  amount text NOT NULL,
  type text NOT NULL CHECK (type IN ('daily', 'weekly', 'monthly')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE leaderboard_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage leaderboard bonuses"
ON leaderboard_bonuses
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can view active leaderboard bonuses"
ON leaderboard_bonuses
FOR SELECT
USING (active = true);

-- Create leaderboard_achievements table for gamification
CREATE TABLE IF NOT EXISTS leaderboard_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  achievement_key text NOT NULL,
  date_awarded date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(email, achievement_key, date_awarded)
);

ALTER TABLE leaderboard_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage achievements"
ON leaderboard_achievements
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can view achievements"
ON leaderboard_achievements
FOR SELECT
USING (true);

-- Create trigger for updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_leaderboard_awards_updated_at
  BEFORE UPDATE ON leaderboard_awards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_leaderboard_bonuses_updated_at
  BEFORE UPDATE ON leaderboard_bonuses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();