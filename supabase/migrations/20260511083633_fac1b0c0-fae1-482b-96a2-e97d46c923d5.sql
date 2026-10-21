-- Allow SDR managers to read CSM-entered manual metrics for their assigned setters
DROP POLICY IF EXISTS "Authorized roles can read manual_daily_metrics" ON public.manual_daily_metrics;

CREATE POLICY "Authorized roles can read manual_daily_metrics"
ON public.manual_daily_metrics
FOR SELECT
TO authenticated
USING (
  public.is_admin_role(auth.uid())
  OR public.is_ops_assistant(auth.uid())
  OR (
    public.has_role(auth.uid(), 'csm'::public.app_role)
    AND department = 'fulfilment'::public.metrics_department
  )
  OR (
    public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
    AND department = 'fulfilment'::public.metrics_department
    AND target_role = 'setter'::public.metrics_target_role
    AND target_user_id IN (
      SELECT sp.user_id
      FROM public.sdr_manager_assignments sma
      JOIN public.setters_profiles sp ON sp.id = sma.setter_profile_id
      WHERE sma.manager_user_id = auth.uid()
    )
  )
);

-- Store SDR manager/team focus messages shown as a rolling bulletin for setters
CREATE TABLE IF NOT EXISTS public.team_bulletins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  title text NOT NULL DEFAULT 'Team Focus',
  message text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_bulletins_department_active
ON public.team_bulletins (department, active, starts_on, ends_on);

ALTER TABLE public.team_bulletins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers can view team bulletins" ON public.team_bulletins;
CREATE POLICY "Managers can view team bulletins"
ON public.team_bulletins
FOR SELECT
TO authenticated
USING (
  public.is_admin_role(auth.uid())
  OR public.has_role(auth.uid(), 'csm'::public.app_role)
  OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'setter'::public.app_role)
    AND active = true
    AND department IN (
      SELECT sp.department::text
      FROM public.setters_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.active = true
    )
  )
);

DROP POLICY IF EXISTS "Managers can create team bulletins" ON public.team_bulletins;
CREATE POLICY "Managers can create team bulletins"
ON public.team_bulletins
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.is_admin_role(auth.uid())
    OR public.has_role(auth.uid(), 'csm'::public.app_role)
    OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Managers can update team bulletins" ON public.team_bulletins;
CREATE POLICY "Managers can update team bulletins"
ON public.team_bulletins
FOR UPDATE
TO authenticated
USING (
  public.is_admin_role(auth.uid())
  OR public.has_role(auth.uid(), 'csm'::public.app_role)
  OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
)
WITH CHECK (
  public.is_admin_role(auth.uid())
  OR public.has_role(auth.uid(), 'csm'::public.app_role)
  OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
);

DROP POLICY IF EXISTS "Managers can delete team bulletins" ON public.team_bulletins;
CREATE POLICY "Managers can delete team bulletins"
ON public.team_bulletins
FOR DELETE
TO authenticated
USING (
  public.is_admin_role(auth.uid())
  OR public.has_role(auth.uid(), 'csm'::public.app_role)
  OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
);

DROP TRIGGER IF EXISTS update_team_bulletins_updated_at ON public.team_bulletins;
CREATE TRIGGER update_team_bulletins_updated_at
BEFORE UPDATE ON public.team_bulletins
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();