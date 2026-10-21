ALTER TABLE public.coaching_action_items
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_brief_id uuid;

CREATE INDEX IF NOT EXISTS idx_coaching_action_items_source_brief
  ON public.coaching_action_items (source_brief_id)
  WHERE source_brief_id IS NOT NULL;