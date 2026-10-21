-- Extend department_head_goals allowed departments to include 'dev' and
-- 'marketing' (ruling 2026-08-11): the product owner heads Development and Tom
-- Douglas heads Marketing, alongside the existing sales/fulfilment/hr/
-- client_health heads. Nadia Kowalski now covers both 'sales' and 'fulfilment'
-- (two roster entries, no schema change needed for that part).
--
-- Idempotent: DROP CONSTRAINT IF EXISTS then re-add, so it is safe to run by
-- hand in the hosted SQL editor and again automatically on merge.

ALTER TABLE public.department_head_goals
  DROP CONSTRAINT IF EXISTS dhg_department;

ALTER TABLE public.department_head_goals
  ADD CONSTRAINT dhg_department
  CHECK (department IN ('sales', 'fulfilment', 'hr', 'client_health', 'dev', 'marketing'));
