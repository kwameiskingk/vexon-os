
-- Create gtm_heyreach_events table (raw webhook event log)
CREATE TABLE public.gtm_heyreach_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  campaign_id TEXT,
  campaign_name TEXT,
  sender_name TEXT,
  sender_email TEXT,
  prospect_name TEXT,
  prospect_linkedin_url TEXT,
  prospect_company TEXT,
  message_preview TEXT,
  payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create gtm_campaign_metrics table (aggregated campaign stats)
CREATE TABLE public.gtm_campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heyreach_campaign_id TEXT UNIQUE NOT NULL,
  campaign_name TEXT,
  connections_sent INT DEFAULT 0,
  connections_accepted INT DEFAULT 0,
  messages_sent INT DEFAULT 0,
  messages_replied INT DEFAULT 0,
  inmails_sent INT DEFAULT 0,
  inmails_replied INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create gtm_sender_accounts table (sender profile linking)
CREATE TABLE public.gtm_sender_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name TEXT NOT NULL,
  sender_email TEXT,
  linkedin_url TEXT,
  setter_profile_id UUID REFERENCES public.setters_profiles(id),
  status TEXT DEFAULT 'active',
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gtm_heyreach_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtm_campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtm_sender_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "GTM events readable by authorized roles"
  ON public.gtm_heyreach_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('gtm_engineer', 'admin', 'dev', 'ops')));

CREATE POLICY "GTM campaign metrics readable by authorized roles"
  ON public.gtm_campaign_metrics FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('gtm_engineer', 'admin', 'dev', 'ops')));

CREATE POLICY "GTM sender accounts readable by authorized roles"
  ON public.gtm_sender_accounts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('gtm_engineer', 'admin', 'dev', 'ops')));

CREATE POLICY "GTM sender accounts manageable by authorized roles"
  ON public.gtm_sender_accounts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('gtm_engineer', 'admin', 'dev')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('gtm_engineer', 'admin', 'dev')));

-- Update get_default_departments_for_role
CREATE OR REPLACE FUNCTION public.get_default_departments_for_role(role_name text)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  CASE role_name
    WHEN 'admin' THEN RETURN ARRAY['operations', 'sales', 'accounting', 'hr', 'gtm'];
    WHEN 'dev' THEN RETURN ARRAY['operations', 'sales', 'accounting', 'hr', 'gtm'];
    WHEN 'ops' THEN RETURN ARRAY['operations', 'sales', 'accounting', 'hr', 'gtm'];
    WHEN 'csm' THEN RETURN ARRAY['operations'];
    WHEN 'account_executive' THEN RETURN ARRAY['sales'];
    WHEN 'finance' THEN RETURN ARRAY['accounting'];
    WHEN 'accounting' THEN RETURN ARRAY['accounting'];
    WHEN 'hr' THEN RETURN ARRAY['hr'];
    WHEN 'setter' THEN RETURN ARRAY['operations'];
    WHEN 'gtm_engineer' THEN RETURN ARRAY['gtm'];
    ELSE RETURN ARRAY['operations'];
  END CASE;
END;
$function$;

-- Triggers
CREATE TRIGGER update_gtm_campaign_metrics_updated_at
  BEFORE UPDATE ON public.gtm_campaign_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_gtm_sender_accounts_updated_at
  BEFORE UPDATE ON public.gtm_sender_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
