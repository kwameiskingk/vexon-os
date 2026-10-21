-- Build log (15 Oct 2026, the owner's Dev Centre rulings).
-- dev_projects becomes the record of everything built and billed:
--   client         vexon | northgate  (two commission reports)
--   replaced       what the build replaced (Calendly, Typeform, Arrows, a manual process)
--   billing_model  hours | fee | both | unbilled
--   fee_amount / fee_currency / fee_month   the per-tool fee and the month it was charged
--                  (Northgate Recruitment has no fixed terms: the amount is whatever they pay)
-- Hours saved move to one row PER ROLE in dev_project_hours (a tool used by
-- five setters and one CSM adds up per role). The old single-role columns on
-- dev_projects stay for the Mandate module until it retires; they are
-- back-filled into the new table once, below.
-- Safe to run twice.

ALTER TABLE public.dev_projects
  ADD COLUMN IF NOT EXISTS client text NOT NULL DEFAULT 'vexon',
  ADD COLUMN IF NOT EXISTS replaced text,
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'hours',
  ADD COLUMN IF NOT EXISTS fee_amount numeric,
  ADD COLUMN IF NOT EXISTS fee_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS fee_month date;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dev_projects_client_check') THEN
    ALTER TABLE public.dev_projects ADD CONSTRAINT dev_projects_client_check
      CHECK (client IN ('vexon', 'northgate'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dev_projects_billing_model_check') THEN
    ALTER TABLE public.dev_projects ADD CONSTRAINT dev_projects_billing_model_check
      CHECK (billing_model IN ('hours', 'fee', 'both', 'unbilled'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.dev_project_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.dev_projects(id) ON DELETE CASCADE,
  role_id uuid REFERENCES public.dev_roles(id) ON DELETE SET NULL,
  role_label text,
  people_count integer NOT NULL DEFAULT 1,
  baseline_hours_week numeric,
  new_hours_week numeric,
  reported_hours_week numeric,
  reported_by text,
  reported_at date,
  use_reported boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_project_hours TO authenticated;
GRANT ALL ON public.dev_project_hours TO service_role;
ALTER TABLE public.dev_project_hours ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'dev_project_hours dev all' AND tablename = 'dev_project_hours') THEN
    CREATE POLICY "dev_project_hours dev all" ON public.dev_project_hours FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'dev'::app_role))
      WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_dev_project_hours_updated ON public.dev_project_hours;
CREATE TRIGGER trg_dev_project_hours_updated
  BEFORE UPDATE ON public.dev_project_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS dev_project_hours_project_idx ON public.dev_project_hours(project_id);

-- One-time back-fill of the single-role figures into the per-role table.
INSERT INTO public.dev_project_hours (project_id, role_id, role_label, baseline_hours_week, new_hours_week, reported_hours_week, reported_by, use_reported)
SELECT p.id, p.role_id, r.name, p.baseline_hours_week, p.new_hours_week, p.reported_hours_week, p.reported_by, p.use_reported_for_totals
FROM public.dev_projects p
LEFT JOIN public.dev_roles r ON r.id = p.role_id
WHERE (p.baseline_hours_week IS NOT NULL OR p.new_hours_week IS NOT NULL OR p.reported_hours_week IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.dev_project_hours h WHERE h.project_id = p.id);

-- Proof
SELECT
  (SELECT count(*) FROM public.dev_projects) AS projects,
  (SELECT count(*) FROM public.dev_project_hours) AS hour_rows,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'dev_projects' AND column_name IN ('client','replaced','billing_model','fee_amount','fee_currency','fee_month')) AS new_columns;
