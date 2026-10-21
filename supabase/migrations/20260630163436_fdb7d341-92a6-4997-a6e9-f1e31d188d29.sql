
ALTER TABLE public.setters_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.setters_profiles_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_setters_profiles_updated_at ON public.setters_profiles;
CREATE TRIGGER trg_setters_profiles_updated_at
BEFORE UPDATE ON public.setters_profiles
FOR EACH ROW EXECUTE FUNCTION public.setters_profiles_set_updated_at();

UPDATE public.setters_profiles
SET updated_at = now()
WHERE id IN ('b9d520d9-800a-463e-8579-c439fbd311d8','15e45281-1df3-4af2-8251-d872ef0bd6c2')
   OR user_id IN ('b9d520d9-800a-463e-8579-c439fbd311d8','15e45281-1df3-4af2-8251-d872ef0bd6c2');
