-- Elena (ops, 7f7af50f-…) gets CEO Command parity — Marcus's ruling relayed
-- by the owner, 8 Sep 2026 ("full visibility, same as him, full parity"). This
-- reverses the 6 Jul 2026 revoke (20260706153523) and widens the four tables
-- the CEO surface reads that were locked to admin/dev or to Marcus's own
-- user id. Every new arm is keyed on the can_view_ceo_dashboard capability so
-- access follows the grant, not the ops role. department_head_goals: the
-- 30 Jul header excluded ops because Elena is a subject of that log; the owner
-- ruled on 8 Sep that she sees her own cards, so the capability now manages
-- it like Marcus does.
-- NOTE: applied via the hosted builder SQL editor; safe to run twice.

-- 1. Capabilities (CEO dashboard + goal editing, as admin/dev have by role)
INSERT INTO public.user_capabilities (user_id, capability, granted_by)
VALUES
  ('916e451a-9e25-4e27-89ab-a5f3374d81ac', 'can_view_ceo_dashboard', 'a59995b2-0ecd-4aa0-8698-a8399d4423dd'),
  ('916e451a-9e25-4e27-89ab-a5f3374d81ac', 'can_manage_goals', 'a59995b2-0ecd-4aa0-8698-a8399d4423dd')
ON CONFLICT (user_id, capability) DO NOTHING;

-- 2. Core Team Projects board — was bound to Marcus's user id on all four verbs.
DROP POLICY IF EXISTS "CEO only - select" ON public.ceo_initiatives;
DROP POLICY IF EXISTS "CEO only - insert" ON public.ceo_initiatives;
DROP POLICY IF EXISTS "CEO only - update" ON public.ceo_initiatives;
DROP POLICY IF EXISTS "CEO only - delete" ON public.ceo_initiatives;
DROP POLICY IF EXISTS "CEO capability manages initiatives" ON public.ceo_initiatives;
CREATE POLICY "CEO capability manages initiatives"
  ON public.ceo_initiatives
  FOR ALL
  TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ceo_dashboard'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ceo_dashboard'));

-- 3. Growth inputs drawer (admin/dev only today)
DROP POLICY IF EXISTS "CEO capability manages growth inputs" ON public.ceo_growth_inputs;
CREATE POLICY "CEO capability manages growth inputs"
  ON public.ceo_growth_inputs
  FOR ALL
  TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ceo_dashboard'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ceo_dashboard'));

-- 4. Department-head goal log (admin/dev only today; the owner's 8 Sep ruling)
DROP POLICY IF EXISTS "CEO capability manages department head goals" ON public.department_head_goals;
CREATE POLICY "CEO capability manages department head goals"
  ON public.department_head_goals
  FOR ALL
  TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ceo_dashboard'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ceo_dashboard'));

-- 5. Cash collected + legacy clients table (admin only today; CEO surface reads)
DROP POLICY IF EXISTS "CEO capability reads client payments" ON public.client_payments;
CREATE POLICY "CEO capability reads client payments"
  ON public.client_payments
  FOR SELECT
  TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ceo_dashboard'));

DROP POLICY IF EXISTS "CEO capability reads clients" ON public.clients;
CREATE POLICY "CEO capability reads clients"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ceo_dashboard'));

notify pgrst, 'reload schema';
