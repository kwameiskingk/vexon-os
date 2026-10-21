
DROP POLICY IF EXISTS "SoD settings writable by admin/dev" ON public.start_of_day_settings;
DROP POLICY IF EXISTS "SoD settings writable by admin/dev/ops" ON public.start_of_day_settings;
CREATE POLICY "SoD settings writable by admin/dev/sdr_manager"
  ON public.start_of_day_settings
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_sdr_manager_role(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_sdr_manager_role(auth.uid())
  );

DROP POLICY IF EXISTS "EOD settings writable by admin/dev" ON public.eod_settings;
DROP POLICY IF EXISTS "EOD settings writable by admin/dev/ops" ON public.eod_settings;
CREATE POLICY "EOD settings writable by admin/dev/sdr_manager"
  ON public.eod_settings
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_sdr_manager_role(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_sdr_manager_role(auth.uid())
  );

DROP POLICY IF EXISTS "Admin and dev can update hourly update settings" ON public.hourly_update_settings;
DROP POLICY IF EXISTS "Hourly update settings writable by admin/dev/ops" ON public.hourly_update_settings;
CREATE POLICY "Hourly update settings writable by admin/dev/sdr_manager"
  ON public.hourly_update_settings
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_sdr_manager_role(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_sdr_manager_role(auth.uid())
  );
