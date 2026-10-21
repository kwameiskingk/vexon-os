CREATE POLICY "Authorized roles can delete research"
ON public.pre_disco_research
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'dev', 'ops', 'account_executive')
  )
);