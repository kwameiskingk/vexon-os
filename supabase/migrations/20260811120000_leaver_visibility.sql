-- Leaver visibility for SDR managers
-- (design: WEEKLY_REVIEWS_AND_LEAVERS_DESIGN_2026-08-11, PR 2).
--
-- READ-ONLY additions. A manager's profile visibility over their
-- departments already has no active gate; these policies extend the same
-- treatment to the data behind those profiles so former setters' history
-- (days worked, meetings booked/sat, role rows) is readable. Every write
-- policy stays active-gated — history is readable, never editable.
-- setter_close_metrics needs nothing (already readable by authenticated).

-- Days worked: attendance history of any genuine (active or former)
-- departmental setter. Mirrors the existing active-gated SELECT policy with
-- the non-active helper.
create policy "SDR manager views former-setter attendance"
  on public.employee_attendance
  for select
  using (
    has_sdr_manager_role(auth.uid())
    and employee_id <> auth.uid()
    and is_genuine_setter_in_departments(employee_id, sdr_manager_departments(auth.uid()))
  );

-- Role rows: filterToSetterRoleIds and the review scope checks read
-- user_roles AS THE MANAGER; without this, former setters vanish from every
-- role-gated surface even where their profile row is visible.
create policy "SDR manager views former-setter roles"
  on public.user_roles
  for select
  using (
    has_sdr_manager_role(auth.uid())
    and role = 'setter'::app_role
    and user_id <> auth.uid()
    and is_genuine_setter_in_departments(user_id, sdr_manager_departments(auth.uid()))
  );

-- Meetings: the existing sdr_manager policy is assignment-based, and former
-- setters have no sdr_manager_assignments rows. Department-based read for
-- meetings belonging to any (active or former) departmental setter profile.
-- The setters_profiles subqueries evaluate under the manager's own RLS,
-- which is department-scoped and not active-gated.
create policy "SDR manager views departmental setter meetings"
  on public.meetings
  for select
  using (
    has_sdr_manager_role(auth.uid())
    and (
      setter_profile_id in (
        select sp.id from public.setters_profiles sp
        where sp.department = any (sdr_manager_departments(auth.uid()))
      )
      or logged_by_setter_id in (
        select sp.user_id from public.setters_profiles sp
        where sp.department = any (sdr_manager_departments(auth.uid()))
      )
    )
  );

-- Data fix: two legacy leavers lost their 'setter' user_roles rows in old
-- role-change flows (current offboarding only flips active=false and leaves
-- roles in place — the convention the other seven leavers follow). Restore
-- them so the strict role-based helpers cover them too.
insert into public.user_roles (user_id, role)
values
  ('0fad9ce6-6a82-4e08-8023-7e48a8b0d63e', 'setter'), -- Caleb Moss (inactive)
  ('60eab4df-dd21-4801-8be7-2b1fbf6313ae', 'setter')  -- Leo Marsh (inactive)
on conflict (user_id, role) do nothing;
