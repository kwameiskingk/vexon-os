-- Add KPI override columns to client_profiles table
ALTER TABLE public.client_profiles
ADD COLUMN IF NOT EXISTS kpi_meetings_booked INTEGER,
ADD COLUMN IF NOT EXISTS kpi_meetings_sat INTEGER,
ADD COLUMN IF NOT EXISTS kpi_meetings_approved INTEGER,
ADD COLUMN IF NOT EXISTS kpi_meetings_rejected INTEGER,
ADD COLUMN IF NOT EXISTS kpi_opportunities INTEGER,
ADD COLUMN IF NOT EXISTS kpi_last_updated TIMESTAMP WITH TIME ZONE;