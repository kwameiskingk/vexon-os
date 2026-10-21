-- Allow 'talent_acquisition' in department_head_goals.dhg_department.
--
-- Sofia Marin was added to DEPARTMENT_HEADS (departmentHeadGoals.ts) on 25 Aug
-- with department 'talent_acquisition', but the CHECK constraint was never
-- widened, so every save of her goal card fails with a constraint violation.
-- Mirrors 20260811140000_dept_head_goals_add_dev_marketing.sql (idempotent:
-- safe to run by hand in the hosted SQL editor and again on merge).

ALTER TABLE public.department_head_goals
  DROP CONSTRAINT IF EXISTS dhg_department;

ALTER TABLE public.department_head_goals
  ADD CONSTRAINT dhg_department
  CHECK (department IN ('sales', 'fulfilment', 'hr', 'client_health', 'dev', 'marketing', 'talent_acquisition'));
