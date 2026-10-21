-- SDR-manager access to setter performance reviews, scoped server-side.
--
-- sdr_manager may SELECT / INSERT / UPDATE performance_reviews (and read the
-- matching briefs) ONLY where the reviewee is a GENUINE fulfilment setter:
-- verified against the reviewee's ACTUAL user_roles row + setters_profiles
-- department/test flag — never a self-declared column on the review row —
-- and never themselves. Admin/dev/ops keep full access via the existing
-- policies (unchanged). Setters and csm remain absent from every policy.
--
-- NOT applied by the assistant — the owner previews and applies.

-- The reviewee gate. SECURITY DEFINER so the check itself does not depend on
-- the caller's visibility of setters_profiles / user_roles.
CREATE OR REPLACE FUNCTION public.is_genuine_fulfilment_setter(_user_id uuid)
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
  );
$$;

CREATE POLICY "SDR manager views fulfilment setter reviews"
ON public.performance_reviews FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'sdr_manager')
  AND reviewee_user_id <> auth.uid()
  AND public.is_genuine_fulfilment_setter(reviewee_user_id)
);

CREATE POLICY "SDR manager creates fulfilment setter reviews"
ON public.performance_reviews FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'sdr_manager')
  AND created_by = auth.uid()
  AND reviewee_user_id <> auth.uid()
  AND public.is_genuine_fulfilment_setter(reviewee_user_id)
);

-- UPDATE is needed so the client can mark a review 'failed' if the compile
-- invocation errors; the reviewee gate applies on both sides so the row can
-- never be re-pointed at an out-of-scope reviewee.
CREATE POLICY "SDR manager updates fulfilment setter reviews"
ON public.performance_reviews FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'sdr_manager')
  AND reviewee_user_id <> auth.uid()
  AND public.is_genuine_fulfilment_setter(reviewee_user_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'sdr_manager')
  AND reviewee_user_id <> auth.uid()
  AND public.is_genuine_fulfilment_setter(reviewee_user_id)
);

CREATE POLICY "SDR manager views fulfilment setter review briefs"
ON public.performance_review_briefs FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'sdr_manager')
  AND EXISTS (
    SELECT 1 FROM public.performance_reviews r
    WHERE r.id = performance_review_briefs.review_id
      AND r.reviewee_user_id <> auth.uid()
      AND public.is_genuine_fulfilment_setter(r.reviewee_user_id)
  )
);
