
ALTER TABLE public.setter_feedback
  ADD COLUMN IF NOT EXISTS hit_goal BOOLEAN,
  ADD COLUMN IF NOT EXISTS hit_goal_note TEXT,
  ADD COLUMN IF NOT EXISTS anything_else TEXT;
