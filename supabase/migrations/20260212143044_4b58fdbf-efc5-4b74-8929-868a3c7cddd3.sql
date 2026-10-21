
DROP POLICY "Admins can view all warm leads" ON public.warm_leads;
DROP POLICY "Admins can manage all warm leads" ON public.warm_leads;

CREATE POLICY "Admins can view all warm leads" ON public.warm_leads
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'dev')
  )
);

CREATE POLICY "Admins can manage all warm leads" ON public.warm_leads
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'dev')
  )
);
