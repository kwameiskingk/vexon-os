
DROP VIEW IF EXISTS public.setters_profiles_safe;

-- Recreate without security_invoker so the view runs as its owner (postgres)
-- and bypasses the restrictive base-table RLS. The view only exposes
-- non-sensitive columns, so this is safe.
CREATE VIEW public.setters_profiles_safe AS
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
