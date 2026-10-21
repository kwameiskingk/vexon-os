-- AE outcomes + partner references (18 Sep 2026, Marcus's partnerships call).
-- Partners are REFERENCES, not referrers: when Marcus logs a discovery outcome
-- he answers "Is this a reference?" and the prospect's details go to the
-- partner (name, company, sector, mobile, LinkedIn, email, pain points).
-- When that deal closes the partner is told about the £100 finder's fee.

-- 1. Outcome fields Marcus fills on every disco (sector auto-fills from Close).
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS pain_points text;

-- 2. Partner bank details ("Your details" tab; UK: name, sort code, account no.)
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_sort_code text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_details_updated_at timestamptz;
DROP POLICY IF EXISTS "Partners update their own details" ON public.partners;
CREATE POLICY "Partners update their own details"
  ON public.partners FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 3. References
CREATE TABLE IF NOT EXISTS public.partner_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_name text,
  company_name text,
  sector text,
  mobile text,
  linkedin_url text,
  email text,
  pain_points text,
  note text,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','spoken','closed_won','closed_lost')),
  fee_amount numeric NOT NULL DEFAULT 100,
  fee_status text NOT NULL DEFAULT 'unpaid' CHECK (fee_status IN ('unpaid','paid')),
  fee_paid_at timestamptz,
  partner_notified_at timestamptz,
  closed_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_references_partner_idx ON public.partner_references (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_references_meeting_idx ON public.partner_references (meeting_id);
ALTER TABLE public.partner_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "References: partner reads own" ON public.partner_references;
CREATE POLICY "References: partner reads own" ON public.partner_references
  FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "References: partner marks spoken" ON public.partner_references;
CREATE POLICY "References: partner marks spoken" ON public.partner_references
  FOR UPDATE TO authenticated
  USING (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()))
  WITH CHECK (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "References: staff manage" ON public.partner_references;
CREATE POLICY "References: staff manage" ON public.partner_references
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'dev'::public.app_role)
    OR public.has_role(auth.uid(),'ops'::public.app_role)
    OR public.has_role(auth.uid(),'csm'::public.app_role)
    OR public.has_role(auth.uid(),'account_executive'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'dev'::public.app_role)
    OR public.has_role(auth.uid(),'ops'::public.app_role)
    OR public.has_role(auth.uid(),'csm'::public.app_role)
    OR public.has_role(auth.uid(),'account_executive'::public.app_role)
  );

-- 4. Bells. New reference → the partner; deal closed → the partner (fee) and
--    the CEO. Emails go out from the partner-reference edge function.
CREATE OR REPLACE FUNCTION public.partner_reference_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.partners WHERE id = NEW.partner_id;
  IF v_user IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
    VALUES ('partner', v_user, 'New reference request',
            COALESCE(NEW.contact_name,'A prospect') || COALESCE(' at ' || NEW.company_name,'') || ' would like to hear about working with Meridian. Details are in your portal.',
            'system', '/partnerships/references', NEW.requested_by);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_partner_reference_created ON public.partner_references;
CREATE TRIGGER trg_partner_reference_created
  AFTER INSERT ON public.partner_references
  FOR EACH ROW EXECUTE FUNCTION public.partner_reference_created();

CREATE OR REPLACE FUNCTION public.close_partner_references(_meeting_id uuid, _won boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    UPDATE public.partner_references pr
       SET status = CASE WHEN _won THEN 'closed_won' ELSE 'closed_lost' END,
           updated_at = now()
     WHERE pr.meeting_id = _meeting_id
       AND pr.status IN ('requested','spoken')
     RETURNING pr.id, pr.partner_id, pr.company_name, pr.fee_amount
  LOOP
    IF _won THEN
      INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
      SELECT 'partner', p.user_id, 'They signed — finder''s fee owed to you',
             COALESCE(r.company_name,'The prospect you spoke to') || ' has become a Meridian client. A £' || trim(to_char(r.fee_amount,'FM9999990')) || ' finder''s fee is on its way.',
             'system', '/partnerships/references', NULL
      FROM public.partners p WHERE p.id = r.partner_id;
      INSERT INTO public.notifications (recipient_role, recipient_id, title, message, category, link_url, triggered_by)
      VALUES ('admin', NULL, 'Finder''s fee due',
              COALESCE(r.company_name,'A referenced prospect') || ' closed — £' || trim(to_char(r.fee_amount,'FM9999990')) || ' owed to the reference partner.',
              'system', '/admin/ceo/referrals', NULL);
    END IF;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_partner_references_from_pitch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_meeting_id uuid;
BEGIN
  IF NEW.discovery_log_id IS NULL THEN RETURN NEW; END IF;
  SELECT meeting_id INTO v_meeting_id FROM public.sales_discovery_logs WHERE id = NEW.discovery_log_id;
  IF v_meeting_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.converted_to_client,false) AND NOT COALESCE(OLD.converted_to_client,false) THEN
    PERFORM public.close_partner_references(v_meeting_id, true);
  ELSIF COALESCE(NEW.marked_not_proceeding,false) AND NOT COALESCE(OLD.marked_not_proceeding,false) THEN
    PERFORM public.close_partner_references(v_meeting_id, false);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_partner_references_from_pitch ON public.pitch_calls;
CREATE TRIGGER trg_sync_partner_references_from_pitch
  AFTER UPDATE ON public.pitch_calls
  FOR EACH ROW EXECUTE FUNCTION public.sync_partner_references_from_pitch();

CREATE OR REPLACE FUNCTION public.sync_partner_references_from_discovery_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.meeting_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.converted_to_client,false) AND NOT COALESCE(OLD.converted_to_client,false) THEN
    PERFORM public.close_partner_references(NEW.meeting_id, true);
  ELSIF COALESCE(NEW.marked_not_proceeding,false) AND NOT COALESCE(OLD.marked_not_proceeding,false) THEN
    PERFORM public.close_partner_references(NEW.meeting_id, false);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_partner_references_from_discovery_log ON public.sales_discovery_logs;
CREATE TRIGGER trg_sync_partner_references_from_discovery_log
  AFTER UPDATE ON public.sales_discovery_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_partner_references_from_discovery_log();

-- Proof
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meetings' AND column_name='pain_points') AS meetings_ok,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partners' AND column_name='bank_sort_code') AS partners_ok,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='partner_references') AS references_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='close_partner_references') AS close_fn_ok;
