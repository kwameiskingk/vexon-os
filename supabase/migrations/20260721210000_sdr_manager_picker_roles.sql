-- Fix: SDR-manager performance-review picker renders empty.
--
-- The picker (useReviewSetters) reads setters_profiles AND user_roles — the
-- second read (filterToSetterRoleIds) keeps only users whose user_roles row
-- is 'setter'. setters_profiles already grants sdr_manager their-department
-- setters, but user_roles has NO sdr_manager SELECT policy, so the role
-- check sees zero rows and every profile is filtered out.
--
-- Fix: ONE narrow user_roles SELECT policy — an sdr_manager may see the
-- 'setter' role row of ACTIVE, genuine, non-test FULFILMENT setters other
-- than themselves. Nothing else: no other roles' rows, no acquisition, no
-- test accounts, no self, and no new profile-column access anywhere.
--
-- NOT applied by the assistant — the owner previews and applies.

-- Active variant of the reviews-policy gate (20260721190000). SECURITY
-- DEFINER so the check does not depend on the caller's own row visibility
-- (has_role uses the same pattern; no RLS recursion).
CREATE OR REPLACE FUNCTION public.is_active_genuine_fulfilment_setter(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.setters_profiles sp
    JOIN public.user_roles ur
      ON ur.user_id = sp.user_id AND ur.role = 'setter'
    WHERE sp.user_id = _user_id
      AND sp.department = 'fulfilment'
      AND COALESCE(sp.is_test_account, false) = false
      AND sp.active = true
  );
$$;

CREATE POLICY "SDR manager views fulfilment setter roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (
  public.has_sdr_manager_role(auth.uid())
  AND role = 'setter'
  AND user_id <> auth.uid()
  AND public.is_active_genuine_fulfilment_setter(user_id)
);
