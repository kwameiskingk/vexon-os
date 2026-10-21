-- Add new columns for setter-specific EOD questions
ALTER TABLE public.setter_feedback 
ADD COLUMN IF NOT EXISTS meetings_booked_today integer,
ADD COLUMN IF NOT EXISTS objections_struggled text,
ADD COLUMN IF NOT EXISTS training_needed text;