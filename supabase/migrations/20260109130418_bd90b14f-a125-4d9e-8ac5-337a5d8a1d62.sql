-- Add commission_earned and meetings_sat columns to setters_profiles
-- These values are managed by admin/dev/ops/csm roles and displayed to setters

ALTER TABLE public.setters_profiles
ADD COLUMN commission_earned numeric DEFAULT 0,
ADD COLUMN meetings_sat integer DEFAULT 0;