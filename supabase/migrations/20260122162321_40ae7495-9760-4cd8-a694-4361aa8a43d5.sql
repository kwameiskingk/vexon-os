-- Add start_date column to setters_profiles for tracking actual employment start date
ALTER TABLE public.setters_profiles 
ADD COLUMN start_date DATE DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.setters_profiles.start_date IS 'The actual date the employee started working at the company';