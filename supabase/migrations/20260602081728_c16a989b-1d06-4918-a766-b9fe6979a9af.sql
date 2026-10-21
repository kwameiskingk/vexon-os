-- Birthday field on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday DATE;

-- Probation + hourly form toggle on setters_profiles
ALTER TABLE public.setters_profiles
  ADD COLUMN IF NOT EXISTS on_probation BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS probation_start_date DATE,
  ADD COLUMN IF NOT EXISTS hourly_form_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hourly_form_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hourly_form_updated_by UUID;

-- Trigger to stamp who toggled hourly_form_enabled
CREATE OR REPLACE FUNCTION public.stamp_hourly_form_toggle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.hourly_form_enabled IS DISTINCT FROM OLD.hourly_form_enabled THEN
    NEW.hourly_form_updated_at := now();
    NEW.hourly_form_updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_hourly_form_toggle ON public.setters_profiles;
CREATE TRIGGER trg_stamp_hourly_form_toggle
BEFORE UPDATE ON public.setters_profiles
FOR EACH ROW
EXECUTE FUNCTION public.stamp_hourly_form_toggle();