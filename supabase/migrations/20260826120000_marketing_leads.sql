-- Marketing Hub: marketing_leads table (2026-08-26)
-- BOOKKEEPING: applied manually by the owner via the hosted builder SQL editor on 2026-08-26
-- (authorised in chat). One row per marketing lead from the Meta-ads funnel
-- (Typeform webhook -> marketing-lead-intake) or HeyReach (heyreach-webhook).
-- New table only — no existing data touched. Every statement guarded; safe to re-run.

CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('meta_ads','heyreach')),
  typeform_response_token TEXT UNIQUE,
  heyreach_event_id UUID UNIQUE REFERENCES public.gtm_heyreach_events(id) ON DELETE SET NULL,
  name TEXT,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  revenue_band TEXT,
  qualification TEXT CHECK (qualification IN ('qualified','price_qualified','unqualified')),
  outcome TEXT CHECK (outcome IN ('meeting_booked','no_meeting')),
  booking_url TEXT,
  campaign_name TEXT,
  sentiment TEXT,
  is_partial BOOLEAN NOT NULL DEFAULT false,
  raw JSONB,
  submitted_at TIMESTAMPTZ,
  seen_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_created_at ON public.marketing_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_source ON public.marketing_leads (source);

ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

-- Read/update: Tom (Marketing Hub owner) + admin tier.
-- Inserts come ONLY from edge functions via service role — no INSERT policy on purpose,
-- so nobody can fabricate leads from the browser.
DROP POLICY IF EXISTS "Marketing hub read" ON public.marketing_leads;
CREATE POLICY "Marketing hub read" ON public.marketing_leads
  FOR SELECT TO authenticated
  USING (
    auth.uid() = '42292222-46a0-4b2c-85b8-ecf3fca6415b'::uuid
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  );

DROP POLICY IF EXISTS "Marketing hub update" ON public.marketing_leads;
CREATE POLICY "Marketing hub update" ON public.marketing_leads
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = '42292222-46a0-4b2c-85b8-ecf3fca6415b'::uuid
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  )
  WITH CHECK (
    auth.uid() = '42292222-46a0-4b2c-85b8-ecf3fca6415b'::uuid
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  );

DROP TRIGGER IF EXISTS trg_marketing_leads_updated_at ON public.marketing_leads;
CREATE TRIGGER trg_marketing_leads_updated_at
  BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
