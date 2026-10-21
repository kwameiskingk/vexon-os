
-- Create teleprompter_scripts table
CREATE TABLE public.teleprompter_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  scroll_speed INTEGER NOT NULL DEFAULT 3,
  font_size INTEGER NOT NULL DEFAULT 28,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.teleprompter_scripts ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own scripts
CREATE POLICY "Users can view own scripts" ON public.teleprompter_scripts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scripts" ON public.teleprompter_scripts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scripts" ON public.teleprompter_scripts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scripts" ON public.teleprompter_scripts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Updated at trigger
CREATE TRIGGER update_teleprompter_scripts_updated_at
  BEFORE UPDATE ON public.teleprompter_scripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
