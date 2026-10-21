ALTER TABLE public.dev_projects
  ADD COLUMN IF NOT EXISTS reported_hours_week numeric,
  ADD COLUMN IF NOT EXISTS reported_by text,
  ADD COLUMN IF NOT EXISTS use_reported_for_totals boolean NOT NULL DEFAULT false;