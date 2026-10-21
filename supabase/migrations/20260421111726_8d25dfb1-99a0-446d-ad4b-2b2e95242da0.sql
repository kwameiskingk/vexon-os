ALTER TABLE public.hourly_updates ADD COLUMN IF NOT EXISTS connects_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.setter_feedback ADD COLUMN IF NOT EXISTS calls_reviewed integer;