
ALTER TABLE public.setters_profiles ADD COLUMN IF NOT EXISTS close_user_id text;
CREATE UNIQUE INDEX IF NOT EXISTS setters_profiles_close_user_id_uidx ON public.setters_profiles(close_user_id) WHERE close_user_id IS NOT NULL;

UPDATE public.setters_profiles SET close_user_id = 'user_demo69b7d3c85bed' WHERE full_name = 'Ethan Cole';
UPDATE public.setters_profiles SET close_user_id = 'user_demo66e0e7f3ea47' WHERE full_name = 'Tom Reilly';
UPDATE public.setters_profiles SET close_user_id = 'user_demoe7424ef24620' WHERE full_name = 'Amir Haddad';
UPDATE public.setters_profiles SET close_user_id = 'user_demod697256a6ada' WHERE full_name = 'Ravi Menon';
UPDATE public.setters_profiles SET close_user_id = 'user_demo801656478807' WHERE full_name = 'Aidan Brooks';
UPDATE public.setters_profiles SET close_user_id = 'user_demo0ce398852403' WHERE full_name = 'Noah Fischer';
UPDATE public.setters_profiles SET close_user_id = 'user_demo6007f8eff71b' WHERE full_name = 'Mia Jansen';
UPDATE public.setters_profiles SET close_user_id = 'user_demoef524b6f0203' WHERE full_name = 'Leo Marsh';
UPDATE public.setters_profiles SET close_user_id = 'user_demo2ba344c1f67f' WHERE full_name = 'Jordan Reyes';
UPDATE public.setters_profiles SET close_user_id = 'user_demoee52dc6e4b94' WHERE full_name = 'Luis Ferreira';
UPDATE public.setters_profiles SET close_user_id = 'user_demodfb4eaf9aba6' WHERE full_name = 'Aisha Khan';

CREATE TABLE IF NOT EXISTS public.setter_close_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  close_user_id text NOT NULL,
  date date NOT NULL,
  setter_name text,
  department text,
  dials integer NOT NULL DEFAULT 0,
  talk_time_seconds integer NOT NULL DEFAULT 0,
  connects integer NOT NULL DEFAULT 0,
  connect_rate numeric(6,2) NOT NULL DEFAULT 0,
  connects_3_plus_mins integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (close_user_id, date)
);

CREATE INDEX IF NOT EXISTS setter_close_metrics_date_idx ON public.setter_close_metrics(date);
CREATE INDEX IF NOT EXISTS setter_close_metrics_close_user_id_idx ON public.setter_close_metrics(close_user_id);

ALTER TABLE public.setter_close_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view close metrics"
  ON public.setter_close_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_setter_close_metrics_updated_at
  BEFORE UPDATE ON public.setter_close_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
