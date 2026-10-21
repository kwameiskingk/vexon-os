
CREATE TABLE public.call_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  call_id text UNIQUE NOT NULL,
  setter_id text NOT NULL,
  setter_name text NOT NULL,
  department text NOT NULL,
  call_date date NOT NULL,
  recording_url text,
  weighted_total numeric(5,2) NOT NULL,
  performance_rating text NOT NULL,
  mandatory_gates_passed boolean NOT NULL DEFAULT false,
  mandatory_gates jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_reviewer_notes text,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_call_scores_setter_id ON public.call_scores(setter_id);
CREATE INDEX idx_call_scores_call_date ON public.call_scores(call_date);
CREATE INDEX idx_call_scores_department ON public.call_scores(department);
CREATE INDEX idx_call_scores_weighted_total ON public.call_scores(weighted_total);

ALTER TABLE public.call_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view call scores"
ON public.call_scores FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'ops'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
  OR public.has_role(auth.uid(), 'sdr_manager'::app_role)
  OR public.has_role(auth.uid(), 'csm'::app_role)
);
