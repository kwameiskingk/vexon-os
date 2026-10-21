-- Integration switches (20 Sep 2026, the owner): automations stay OFF until he
-- flips them in Dev Centre → Integrations. Read by the edge functions on
-- every event, so no redeploy is needed to change them.
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS pandadoc_paid_automation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kit_sequences_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.system_settings.pandadoc_paid_automation IS 'Paid PandaDoc agreement → start client onboarding + welcome email';
COMMENT ON COLUMN public.system_settings.kit_sequences_enabled IS 'New bookings → add the prospect to the event''s Kit sequence';
-- Proof
SELECT pandadoc_paid_automation, kit_sequences_enabled FROM public.system_settings LIMIT 1;
