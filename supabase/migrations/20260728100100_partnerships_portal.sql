-- Partnerships Portal — Migration 2 of 2 (applied manually by the owner in the
-- the hosted builder SQL editor on 2026-07-28, after Migration 1).
--
-- partners / referrals / partner_documents + meetings.source_referral_id,
-- RLS, referral outcome-sync triggers, and the private partner-documents
-- storage bucket. Referral visibility is deliberately admin/dev/ops +
-- account_executive (NOT is_admin_role — csm/finance excluded per ruling).
-- "Discovery" = a meetings row (department='acquisition'); there is no
-- discoveries table.

-- Guard: abort if this migration has already run
DO $$
BEGIN
  IF to_regclass('public.partners') IS NOT NULL
     OR to_regclass('public.referrals') IS NOT NULL
     OR to_regclass('public.partner_documents') IS NOT NULL THEN
    RAISE EXCEPTION 'Partnerships tables already exist — aborting';
  END IF;
END $$;

-- ── Tables ─────────────────────────────────────────────────────────────

CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  company_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  contact_full_name text NOT NULL,
  contact_mobile text,
  contact_email text,
  referred_company_name text NOT NULL,
  date_referred date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','converted','closed_won','closed_lost')),
  payout_amount numeric,
  payout_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payout_status IN ('unpaid','paid')),
  payout_date date,
  discovery_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  converted_by uuid REFERENCES auth.users(id),
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_referrals_discovery_unique
  ON public.referrals (discovery_id) WHERE discovery_id IS NOT NULL;
CREATE INDEX idx_referrals_partner ON public.referrals (partner_id);
CREATE INDEX idx_referrals_submitted ON public.referrals (created_at)
  WHERE status = 'submitted';

CREATE TABLE public.partner_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  doc_type text NOT NULL DEFAULT 'other'
    CHECK (doc_type IN ('contract','proof_of_payment','other')),
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_documents_partner ON public.partner_documents (partner_id);

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS source_referral_id uuid REFERENCES public.referrals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_source_referral
  ON public.meetings (source_referral_id) WHERE source_referral_id IS NOT NULL;

CREATE TRIGGER update_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view their own partner record"
  ON public.partners FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Internal roles can view partners"
  ON public.partners FOR SELECT
  USING (public.is_admin_role(auth.uid()));

CREATE POLICY "Admin tier can manage partners"
  ON public.partners FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'dev'::app_role)
      OR public.has_role(auth.uid(),'ops'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'dev'::app_role)
      OR public.has_role(auth.uid(),'ops'::app_role));

CREATE POLICY "Partners can view their own referrals"
  ON public.referrals FOR SELECT
  USING (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()));

CREATE POLICY "Partners can submit their own referrals"
  ON public.referrals FOR INSERT
  WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    AND status = 'submitted'
    AND payout_status = 'unpaid'
    AND payout_amount IS NULL
    AND payout_date IS NULL
    AND discovery_id IS NULL
    AND converted_by IS NULL
    AND converted_at IS NULL
  );

CREATE POLICY "AE and admin tier can view referrals"
  ON public.referrals FOR SELECT
  USING (public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'dev'::app_role)
      OR public.has_role(auth.uid(),'ops'::app_role)
      OR public.has_role(auth.uid(),'account_executive'::app_role));

CREATE POLICY "AE and admin tier can update referrals"
  ON public.referrals FOR UPDATE
  USING (public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'dev'::app_role)
      OR public.has_role(auth.uid(),'ops'::app_role)
      OR public.has_role(auth.uid(),'account_executive'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'dev'::app_role)
      OR public.has_role(auth.uid(),'ops'::app_role)
      OR public.has_role(auth.uid(),'account_executive'::app_role));

CREATE POLICY "Admin tier can delete referrals"
  ON public.referrals FOR DELETE
  USING (public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'dev'::app_role));

CREATE POLICY "Partners can view their own documents"
  ON public.partner_documents FOR SELECT
  USING (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()));

CREATE POLICY "Admin tier can manage partner documents"
  ON public.partner_documents FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'dev'::app_role)
      OR public.has_role(auth.uid(),'ops'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'dev'::app_role)
      OR public.has_role(auth.uid(),'ops'::app_role));

-- ── Outcome sync: closed_won / closed_lost derived from the EXISTING deal
--    signals (won = converted_to_client, lost = marked_not_proceeding).
--    Chain: pitch_calls.discovery_log_id → sales_discovery_logs.meeting_id
--    → referrals.discovery_id.

CREATE OR REPLACE FUNCTION public.sync_referral_outcome_from_pitch()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_meeting_id uuid;
BEGIN
  IF NEW.discovery_log_id IS NULL THEN RETURN NEW; END IF;
  SELECT meeting_id INTO v_meeting_id
    FROM public.sales_discovery_logs WHERE id = NEW.discovery_log_id;
  IF v_meeting_id IS NULL THEN RETURN NEW; END IF;

  IF COALESCE(NEW.converted_to_client,false) AND NOT COALESCE(OLD.converted_to_client,false) THEN
    UPDATE public.referrals SET status = 'closed_won'
      WHERE discovery_id = v_meeting_id AND status <> 'closed_won';
  ELSIF COALESCE(NEW.marked_not_proceeding,false) AND NOT COALESCE(OLD.marked_not_proceeding,false) THEN
    UPDATE public.referrals SET status = 'closed_lost'
      WHERE discovery_id = v_meeting_id AND status IN ('submitted','converted');
  ELSIF NOT COALESCE(NEW.marked_not_proceeding,false) AND COALESCE(OLD.marked_not_proceeding,false) THEN
    -- not-proceeding undone → back to converted (won is terminal)
    UPDATE public.referrals SET status = 'converted'
      WHERE discovery_id = v_meeting_id AND status = 'closed_lost';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_referral_outcome_from_pitch
  AFTER UPDATE OF converted_to_client, marked_not_proceeding ON public.pitch_calls
  FOR EACH ROW EXECUTE FUNCTION public.sync_referral_outcome_from_pitch();

CREATE OR REPLACE FUNCTION public.sync_referral_outcome_from_discovery_log()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.meeting_id IS NULL THEN RETURN NEW; END IF;

  IF COALESCE(NEW.converted_to_client,false) AND NOT COALESCE(OLD.converted_to_client,false) THEN
    UPDATE public.referrals SET status = 'closed_won'
      WHERE discovery_id = NEW.meeting_id AND status <> 'closed_won';
  ELSIF COALESCE(NEW.marked_not_proceeding,false) AND NOT COALESCE(OLD.marked_not_proceeding,false) THEN
    UPDATE public.referrals SET status = 'closed_lost'
      WHERE discovery_id = NEW.meeting_id AND status IN ('submitted','converted');
  ELSIF NOT COALESCE(NEW.marked_not_proceeding,false) AND COALESCE(OLD.marked_not_proceeding,false) THEN
    UPDATE public.referrals SET status = 'converted'
      WHERE discovery_id = NEW.meeting_id AND status = 'closed_lost';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_referral_outcome_from_discovery_log
  AFTER UPDATE OF converted_to_client, marked_not_proceeding ON public.sales_discovery_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_referral_outcome_from_discovery_log();

-- ── Storage: private partner-documents bucket (receipts-bucket pattern) ─

INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-documents','partner-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin tier can upload partner documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'partner-documents'
    AND (public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'dev'::app_role)
      OR public.has_role(auth.uid(),'ops'::app_role))
  );

CREATE POLICY "Admin tier can view partner documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'partner-documents'
    AND (public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'dev'::app_role)
      OR public.has_role(auth.uid(),'ops'::app_role))
  );

CREATE POLICY "Admin tier can delete partner documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'partner-documents'
    AND (public.has_role(auth.uid(),'admin'::app_role)
      OR public.has_role(auth.uid(),'dev'::app_role)
      OR public.has_role(auth.uid(),'ops'::app_role))
  );

CREATE POLICY "Partners can view their own document files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'partner-documents'
    AND (storage.foldername(name))[1] IN
        (SELECT id::text FROM public.partners WHERE user_id = auth.uid())
  );
