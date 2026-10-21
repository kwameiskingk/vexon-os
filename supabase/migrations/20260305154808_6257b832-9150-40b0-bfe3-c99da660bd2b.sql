-- Add department column to team_goals if not exists
ALTER TABLE public.team_goals ADD COLUMN IF NOT EXISTS department text DEFAULT NULL;

-- Deactivate duplicate dial_grinder_bronze (sort_order 70) since real ones are acq_weekly_dials_*
UPDATE achievement_definitions SET is_active = false WHERE key = 'dial_grinder_bronze' AND sort_order = 70;