-- Allow AEs to read their own overrides
CREATE POLICY "AEs can read own overrides" ON ae_metrics_overrides
  FOR SELECT USING (ae_user_id = auth.uid());