
CREATE TABLE public.gtm_smartlead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text,
  campaign_id bigint,
  lead_id bigint,
  email_account_id bigint,
  sentiment text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gtm_smartlead_events TO authenticated;
GRANT ALL ON public.gtm_smartlead_events TO service_role;
ALTER TABLE public.gtm_smartlead_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read smartlead events"
  ON public.gtm_smartlead_events FOR SELECT TO authenticated USING (true);

CREATE TABLE public.gtm_smartlead_campaign_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  smartlead_campaign_id bigint UNIQUE,
  campaign_name text,
  emails_sent int NOT NULL DEFAULT 0,
  emails_replied int NOT NULL DEFAULT 0,
  emails_bounced int NOT NULL DEFAULT 0,
  emails_unsubscribed int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gtm_smartlead_campaign_metrics TO authenticated;
GRANT ALL ON public.gtm_smartlead_campaign_metrics TO service_role;
ALTER TABLE public.gtm_smartlead_campaign_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read smartlead campaign metrics"
  ON public.gtm_smartlead_campaign_metrics FOR SELECT TO authenticated USING (true);

CREATE TABLE public.gtm_smartlead_sender_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  smartlead_account_id bigint UNIQUE,
  email_address text,
  setter_profile_id uuid REFERENCES public.setters_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.gtm_smartlead_sender_accounts TO authenticated;
GRANT ALL ON public.gtm_smartlead_sender_accounts TO service_role;
ALTER TABLE public.gtm_smartlead_sender_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read smartlead sender accounts"
  ON public.gtm_smartlead_sender_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage smartlead sender accounts"
  ON public.gtm_smartlead_sender_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.smartlead_reply_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.gtm_smartlead_events(id) ON DELETE CASCADE,
  action text CHECK (action IN ('booked','not_booked','not_interested','needs_nurturing','more_info')),
  sentiment text,
  actioned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.smartlead_reply_actions TO authenticated;
GRANT ALL ON public.smartlead_reply_actions TO service_role;
ALTER TABLE public.smartlead_reply_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read smartlead reply actions"
  ON public.smartlead_reply_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert their own smartlead reply actions"
  ON public.smartlead_reply_actions FOR INSERT TO authenticated WITH CHECK (actioned_by = auth.uid());

CREATE INDEX idx_gtm_smartlead_events_campaign ON public.gtm_smartlead_events(campaign_id);
CREATE INDEX idx_gtm_smartlead_events_account ON public.gtm_smartlead_events(email_account_id);
CREATE INDEX idx_gtm_smartlead_events_type ON public.gtm_smartlead_events(event_type);
