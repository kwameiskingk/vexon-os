
CREATE TABLE public.objection_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_id UUID NOT NULL,
  objection_text TEXT NOT NULL,
  frequency INT NOT NULL DEFAULT 1,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.objection_reports ENABLE ROW LEVEL SECURITY;

-- Setters can insert their own reports
CREATE POLICY "Setters can insert own objection reports" ON public.objection_reports
  FOR INSERT TO authenticated
  WITH CHECK (setter_id = auth.uid());

-- Setters can view their own reports
CREATE POLICY "Setters can view own objection reports" ON public.objection_reports
  FOR SELECT TO authenticated
  USING (setter_id = auth.uid());

-- Admin roles can view all reports
CREATE POLICY "Admin roles can view all objection reports" ON public.objection_reports
  FOR SELECT TO authenticated
  USING (is_admin_role(auth.uid()) OR is_hr_role(auth.uid()) OR has_sdr_manager_role(auth.uid()));
