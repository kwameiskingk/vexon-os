
-- ============================================================
-- 1) Add columns to warm_leads for status tracking & setter assignment
-- ============================================================
ALTER TABLE public.warm_leads
  ADD COLUMN IF NOT EXISTS lead_status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS last_status_update timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_by uuid,
  ADD COLUMN IF NOT EXISTS assigned_setter_id uuid;

-- ============================================================
-- 2) Add assigned_setter_id to leads table
-- ============================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_setter_id uuid;

-- ============================================================
-- 3) Create warm_lead_status_updates activity log table
-- ============================================================
CREATE TABLE public.warm_lead_status_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warm_lead_id uuid NOT NULL REFERENCES public.warm_leads(id) ON DELETE CASCADE,
  status text NOT NULL,
  notes text,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warm_lead_status_updates ENABLE ROW LEVEL SECURITY;

-- Admins/dev/ops/csm can view all status updates
CREATE POLICY "Admin roles can view all status updates"
  ON public.warm_lead_status_updates FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid()
    AND role IN ('admin', 'dev', 'ops', 'csm')
  ));

-- Admins/dev/ops/csm can insert status updates
CREATE POLICY "Admin roles can insert status updates"
  ON public.warm_lead_status_updates FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid()
    AND role IN ('admin', 'dev', 'ops', 'csm', 'setter')
  ));

-- Setters can view status updates for their own leads
CREATE POLICY "Setters can view own lead status updates"
  ON public.warm_lead_status_updates FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM warm_leads wl
    WHERE wl.id = warm_lead_id
    AND (wl.created_by_user_id = auth.uid() OR wl.assigned_setter_id = auth.uid())
  ));

-- Clients can view status updates for approved leads assigned to them
CREATE POLICY "Clients can view status updates for their leads"
  ON public.warm_lead_status_updates FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM warm_leads wl
    WHERE wl.id = warm_lead_id
    AND wl.approval_status = 'approved'
    AND wl.client_profile_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM client_profile_users cpu WHERE cpu.client_profile_id = wl.client_profile_id AND cpu.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.id = wl.client_profile_id AND cp.user_id = auth.uid())
    )
  ));

-- ============================================================
-- 4) Create client_icp_profiles table
-- ============================================================
CREATE TABLE public.client_icp_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  target_industries text[] DEFAULT '{}',
  target_job_titles text[] DEFAULT '{}',
  target_company_sizes text[] DEFAULT '{}',
  target_locations text[] DEFAULT '{}',
  exclusions text,
  additional_criteria text,
  hiring_frequency text,
  min_company_size integer,
  max_company_size integer,
  client_notes text,
  admin_notes text,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_profile_id)
);

ALTER TABLE public.client_icp_profiles ENABLE ROW LEVEL SECURITY;

-- Admin roles full access
CREATE POLICY "Admin roles can manage ICP profiles"
  ON public.client_icp_profiles FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid()
    AND role IN ('admin', 'dev', 'ops', 'csm')
  ));

-- Clients can view and update their own ICP
CREATE POLICY "Clients can view own ICP"
  ON public.client_icp_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM client_profile_users cpu WHERE cpu.client_profile_id = client_icp_profiles.client_profile_id AND cpu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.id = client_icp_profiles.client_profile_id AND cp.user_id = auth.uid())
  );

CREATE POLICY "Clients can update own ICP"
  ON public.client_icp_profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM client_profile_users cpu WHERE cpu.client_profile_id = client_icp_profiles.client_profile_id AND cpu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.id = client_icp_profiles.client_profile_id AND cp.user_id = auth.uid())
  );

CREATE POLICY "Clients can insert own ICP"
  ON public.client_icp_profiles FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM client_profile_users cpu WHERE cpu.client_profile_id = client_icp_profiles.client_profile_id AND cpu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.id = client_icp_profiles.client_profile_id AND cp.user_id = auth.uid())
  );

-- ============================================================
-- 5) Create client_lead_lists table
-- ============================================================
CREATE TABLE public.client_lead_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text,
  file_name text,
  status text NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  client_notes text,
  admin_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_lead_lists ENABLE ROW LEVEL SECURITY;

-- Admin roles full access
CREATE POLICY "Admin roles can manage lead lists"
  ON public.client_lead_lists FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid()
    AND role IN ('admin', 'dev', 'ops', 'csm')
  ));

-- Clients can view their own lead lists
CREATE POLICY "Clients can view own lead lists"
  ON public.client_lead_lists FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM client_profile_users cpu WHERE cpu.client_profile_id = client_lead_lists.client_profile_id AND cpu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.id = client_lead_lists.client_profile_id AND cp.user_id = auth.uid())
  );

CREATE POLICY "Clients can insert own lead lists"
  ON public.client_lead_lists FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM client_profile_users cpu WHERE cpu.client_profile_id = client_lead_lists.client_profile_id AND cpu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.id = client_lead_lists.client_profile_id AND cp.user_id = auth.uid())
  );

CREATE POLICY "Clients can update own lead lists"
  ON public.client_lead_lists FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM client_profile_users cpu WHERE cpu.client_profile_id = client_lead_lists.client_profile_id AND cpu.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.id = client_lead_lists.client_profile_id AND cp.user_id = auth.uid())
  );

-- ============================================================
-- 6) Updated_at triggers
-- ============================================================
CREATE TRIGGER set_updated_at_client_icp_profiles
  BEFORE UPDATE ON public.client_icp_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_client_lead_lists
  BEFORE UPDATE ON public.client_lead_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 7) Auto-assign warm lead to client based on setter assignments
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_assign_warm_lead_to_client()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_setter_profile_id UUID;
  v_client_id UUID;
  v_assignment_count INTEGER;
BEGIN
  -- Only auto-assign if client_profile_id is not already set
  IF NEW.client_profile_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get setter profile id
  SELECT id INTO v_setter_profile_id
  FROM setters_profiles
  WHERE user_id = NEW.created_by_user_id;

  IF v_setter_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count active assignments
  SELECT COUNT(*) INTO v_assignment_count
  FROM setter_client_assignments
  WHERE setter_id = v_setter_profile_id AND status = 'active';

  IF v_assignment_count = 1 THEN
    SELECT client_id INTO v_client_id
    FROM setter_client_assignments
    WHERE setter_id = v_setter_profile_id AND status = 'active';

    NEW.client_profile_id := v_client_id;
  END IF;
  -- If multiple assignments, leave null — frontend will prompt a client picker

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_assign_warm_lead_client
  BEFORE INSERT ON public.warm_leads
  FOR EACH ROW EXECUTE FUNCTION auto_assign_warm_lead_to_client();

-- ============================================================
-- 8) Storage bucket for lead list files
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-list-files',
  'lead-list-files',
  false,
  10485760,
  ARRAY['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Admin roles can manage all files
CREATE POLICY "Admin roles can manage lead list files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'lead-list-files' AND EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid()
    AND role IN ('admin', 'dev', 'ops', 'csm')
  ));

-- Storage RLS: Clients can upload/view their own files
CREATE POLICY "Clients can manage own lead list files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'lead-list-files' AND EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'client'
  ));

-- ============================================================
-- 9) Notification triggers for ICP/Lead List submissions
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_icp_submitted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_company_name TEXT;
BEGIN
  IF OLD.status != 'submitted' AND NEW.status = 'submitted' THEN
    SELECT company_name INTO v_company_name
    FROM client_profiles WHERE id = NEW.client_profile_id;

    INSERT INTO notifications (recipient_role, title, message, category, link_url)
    VALUES (
      'admin',
      'ICP Submitted for Review',
      COALESCE(v_company_name, 'A client') || ' has submitted their ICP for review.',
      'system',
      '/admin/clients'
    );

    INSERT INTO notifications (recipient_role, title, message, category, link_url)
    VALUES (
      'csm',
      'ICP Submitted for Review',
      COALESCE(v_company_name, 'A client') || ' has submitted their ICP for review.',
      'system',
      '/csm/client-health'
    );
  END IF;

  -- Notify client when approved
  IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
    SELECT company_name INTO v_company_name
    FROM client_profiles WHERE id = NEW.client_profile_id;

    -- Notify via client_profile_users
    INSERT INTO notifications (recipient_id, recipient_role, title, message, category, link_url)
    SELECT cpu.user_id, 'client', 'ICP Approved',
      'Your Ideal Candidate Profile has been approved.',
      'system', '/client/lead-lists'
    FROM client_profile_users cpu
    WHERE cpu.client_profile_id = NEW.client_profile_id;

    -- Notify direct user_id
    INSERT INTO notifications (recipient_id, recipient_role, title, message, category, link_url)
    SELECT cp.user_id, 'client', 'ICP Approved',
      'Your Ideal Candidate Profile has been approved.',
      'system', '/client/lead-lists'
    FROM client_profiles cp
    WHERE cp.id = NEW.client_profile_id AND cp.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM client_profile_users cpu
      WHERE cpu.client_profile_id = NEW.client_profile_id AND cpu.user_id = cp.user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_icp_submitted
  AFTER UPDATE ON public.client_icp_profiles
  FOR EACH ROW EXECUTE FUNCTION notify_icp_submitted();

CREATE OR REPLACE FUNCTION public.notify_lead_list_submitted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_company_name TEXT;
BEGIN
  IF OLD.status != 'submitted' AND NEW.status = 'submitted' THEN
    SELECT company_name INTO v_company_name
    FROM client_profiles WHERE id = NEW.client_profile_id;

    INSERT INTO notifications (recipient_role, title, message, category, link_url)
    VALUES (
      'admin',
      'Lead List Submitted for Review',
      COALESCE(v_company_name, 'A client') || ' has submitted a lead list: "' || NEW.name || '".',
      'system',
      '/admin/clients'
    );

    INSERT INTO notifications (recipient_role, title, message, category, link_url)
    VALUES (
      'csm',
      'Lead List Submitted for Review',
      COALESCE(v_company_name, 'A client') || ' has submitted a lead list: "' || NEW.name || '".',
      'system',
      '/csm/client-health'
    );
  END IF;

  -- Notify client when approved
  IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
    INSERT INTO notifications (recipient_id, recipient_role, title, message, category, link_url)
    SELECT cpu.user_id, 'client', 'Lead List Approved',
      'Your lead list "' || NEW.name || '" has been approved.',
      'system', '/client/lead-lists'
    FROM client_profile_users cpu
    WHERE cpu.client_profile_id = NEW.client_profile_id;

    INSERT INTO notifications (recipient_id, recipient_role, title, message, category, link_url)
    SELECT cp.user_id, 'client', 'Lead List Approved',
      'Your lead list "' || NEW.name || '" has been approved.',
      'system', '/client/lead-lists'
    FROM client_profiles cp
    WHERE cp.id = NEW.client_profile_id AND cp.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM client_profile_users cpu
      WHERE cpu.client_profile_id = NEW.client_profile_id AND cpu.user_id = cp.user_id
    );
  END IF;

  -- Notify client when rejected
  IF OLD.status != 'rejected' AND NEW.status = 'rejected' THEN
    INSERT INTO notifications (recipient_id, recipient_role, title, message, category, link_url)
    SELECT cpu.user_id, 'client', 'Lead List Needs Revision',
      'Your lead list "' || NEW.name || '" needs revision. Check admin notes for details.',
      'system', '/client/lead-lists'
    FROM client_profile_users cpu
    WHERE cpu.client_profile_id = NEW.client_profile_id;

    INSERT INTO notifications (recipient_id, recipient_role, title, message, category, link_url)
    SELECT cp.user_id, 'client', 'Lead List Needs Revision',
      'Your lead list "' || NEW.name || '" needs revision. Check admin notes for details.',
      'system', '/client/lead-lists'
    FROM client_profiles cp
    WHERE cp.id = NEW.client_profile_id AND cp.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM client_profile_users cpu
      WHERE cpu.client_profile_id = NEW.client_profile_id AND cpu.user_id = cp.user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_lead_list_submitted
  AFTER UPDATE ON public.client_lead_lists
  FOR EACH ROW EXECUTE FUNCTION notify_lead_list_submitted();
