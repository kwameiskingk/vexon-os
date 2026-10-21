-- SDR manager AE reviews
-- (design: WEEKLY_REVIEWS_AND_LEAVERS_DESIGN_2026-08-11, PR 3).
--
-- An acquisition-running SDR manager (Nadia post-flip) can create, read and
-- update AE performance reviews from their own portal. Mirrors the existing
-- sdr_manager setter-review policies (migration 20260727150000) with the
-- AE-shaped gates. Non-active variant so former AEs stay reviewable —
-- writes still require the manager to CURRENTLY run acquisition.
-- AEs still never see their own reviews (2026-07-28 ruling: no AE
-- self-view policy exists, and reviewee_user_id <> auth.uid() throughout).

create or replace function public.is_genuine_ae(_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.setters_profiles sp
    join public.user_roles ur
      on ur.user_id = sp.user_id and ur.role = 'account_executive'
    where sp.user_id = _user_id
      and sp.department = 'sales'
      and coalesce(sp.is_test_account, false) = false
  );
$function$;

create policy "SDR manager creates managed AE reviews"
  on public.performance_reviews
  for insert
  with check (
    has_role(auth.uid(), 'sdr_manager'::app_role)
    and created_by = auth.uid()
    and reviewee_user_id <> auth.uid()
    and sdr_manager_manages_aes(auth.uid())
    and is_genuine_ae(reviewee_user_id)
  );

create policy "SDR manager views managed AE reviews"
  on public.performance_reviews
  for select
  using (
    has_role(auth.uid(), 'sdr_manager'::app_role)
    and reviewee_user_id <> auth.uid()
    and sdr_manager_manages_aes(auth.uid())
    and is_genuine_ae(reviewee_user_id)
  );

create policy "SDR manager updates managed AE reviews"
  on public.performance_reviews
  for update
  using (
    has_role(auth.uid(), 'sdr_manager'::app_role)
    and reviewee_user_id <> auth.uid()
    and sdr_manager_manages_aes(auth.uid())
    and is_genuine_ae(reviewee_user_id)
  );

create policy "SDR manager views managed AE review briefs"
  on public.performance_review_briefs
  for select
  using (
    has_role(auth.uid(), 'sdr_manager'::app_role)
    and exists (
      select 1
      from public.performance_reviews r
      where r.id = performance_review_briefs.review_id
        and r.reviewee_user_id <> auth.uid()
        and sdr_manager_manages_aes(auth.uid())
        and is_genuine_ae(r.reviewee_user_id)
    )
  );
