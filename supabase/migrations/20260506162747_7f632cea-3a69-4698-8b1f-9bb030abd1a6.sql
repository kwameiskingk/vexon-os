
-- 1) Create a safe view of setters_profiles that EXCLUDES sensitive fields
--    (status, coaching, discipline notes, salary/commission, targets, start_date)
DROP VIEW IF EXISTS public.setters_profiles_safe;

CREATE VIEW public.setters_profiles_safe
WITH (security_invoker = on) AS
SELECT
  id,
  user_id,
  email,
  full_name,
  active,
  created_at,
  department,
  title,
  rival_email,
  rivalry_started_at,
  rivalry_end_pending,
  rivalry_reward_amount,
  rivalry_reward_type,
  rivalry_end_date,
  rivalry_reward_set_by,
  last_rivalry_winner_email,
  last_rivalry_ended_at
FROM public.setters_profiles;

GRANT SELECT ON public.setters_profiles_safe TO authenticated;

-- 2) Tighten base table SELECT policy so setters cannot read peers' sensitive
--    columns (status='pip', coaching focus, notes, salary, etc.)
DROP POLICY IF EXISTS "Setters, SDR managers, admins and ops assistant can view setter" ON public.setters_profiles;

-- Setters can ONLY read their own full row
CREATE POLICY "Setters can view their own profile"
ON public.setters_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- SDR managers, admins, and ops assistants can read all rows
CREATE POLICY "Managers, admins and ops can view all setter profiles"
ON public.setters_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'sdr_manager'::app_role)
  OR is_admin_role(auth.uid())
  OR is_ops_assistant(auth.uid())
);
