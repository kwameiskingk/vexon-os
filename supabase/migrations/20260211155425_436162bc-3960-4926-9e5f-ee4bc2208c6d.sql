
-- Fix default values for target columns
ALTER TABLE public.setters_profiles 
  ALTER COLUMN daily_talk_time_target SET DEFAULT 90,
  ALTER COLUMN weekly_meetings_target SET DEFAULT 6;

-- Update existing NULL values to proper defaults
UPDATE public.setters_profiles 
SET daily_dials_target = 150 WHERE daily_dials_target IS NULL;

UPDATE public.setters_profiles 
SET daily_meetings_target = 2 WHERE daily_meetings_target IS NULL;

UPDATE public.setters_profiles 
SET daily_talk_time_target = 90 WHERE daily_talk_time_target IS NULL;

UPDATE public.setters_profiles 
SET weekly_meetings_target = 6 WHERE weekly_meetings_target IS NULL;

-- Update any existing records that have old defaults (120 talk time, 50 weekly)
UPDATE public.setters_profiles 
SET daily_talk_time_target = 90 WHERE daily_talk_time_target = 120;

UPDATE public.setters_profiles 
SET weekly_meetings_target = 6 WHERE weekly_meetings_target = 50;

-- Allow SDR managers to update setter profiles they manage
CREATE POLICY "SDR managers can update managed setter profiles"
ON public.setters_profiles
FOR UPDATE
USING (
  has_sdr_manager_role(auth.uid()) 
  AND id IN (
    SELECT setter_profile_id FROM public.sdr_manager_assignments 
    WHERE manager_user_id = auth.uid()
  )
)
WITH CHECK (
  has_sdr_manager_role(auth.uid()) 
  AND id IN (
    SELECT setter_profile_id FROM public.sdr_manager_assignments 
    WHERE manager_user_id = auth.uid()
  )
);
