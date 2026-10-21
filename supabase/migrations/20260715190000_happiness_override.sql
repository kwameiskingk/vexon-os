-- Client happiness override (N11 "% clients happy"). The computed default
-- per client is: hitting their weekly target (latest completed
-- campaign_weekly_goals week met) AND on a 3+ week streak — the same
-- rolling-current-state logic as the live N9/N10 tiles. The CSM can
-- override that per client; the override wins outright, no blending.
--   NULL  = use the computed default
--   true  = CSM says happy
--   false = CSM says not happy
-- Additive: existing health columns (health_override, health_score) are
-- untouched. No RLS change needed — "Admin roles can manage all client
-- profiles" (is_admin_role: admin/dev/ops/finance/csm/account_executive)
-- already covers the override writes; setters have no client_profiles
-- UPDATE path.
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS happiness_override boolean,
  ADD COLUMN IF NOT EXISTS happiness_override_note text;
