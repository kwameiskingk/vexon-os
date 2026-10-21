-- Add department field to setters_profiles table
ALTER TABLE public.setters_profiles 
ADD COLUMN department text NOT NULL DEFAULT 'fulfilment' 
CHECK (department IN ('fulfilment', 'acquisition'));