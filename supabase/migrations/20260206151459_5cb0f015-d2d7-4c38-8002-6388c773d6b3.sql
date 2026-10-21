
-- Add achievement_data_source column to system_settings
ALTER TABLE public.system_settings
ADD COLUMN IF NOT EXISTS achievement_data_source text NOT NULL DEFAULT 'auto';

-- Add comment for clarity
COMMENT ON COLUMN public.system_settings.achievement_data_source IS 'auto = Google Sheets/performance table, manual = in-app meetings table';
