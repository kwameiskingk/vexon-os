ALTER TABLE public.midday_reports
  ADD COLUMN IF NOT EXISTS on_track_action text,
  ADD COLUMN IF NOT EXISTS off_track_reason text,
  ALTER COLUMN dials_count DROP NOT NULL,
  ALTER COLUMN talk_time_minutes DROP NOT NULL,
  ALTER COLUMN connects_count DROP NOT NULL;