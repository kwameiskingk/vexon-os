
-- Roster clients: which clients appear in a manager's roster view
CREATE TABLE public.roster_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_profile_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  manager_user_id UUID NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_profile_id, manager_user_id)
);

-- Roster entries: daily setter-client assignments
CREATE TABLE public.roster_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_profile_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  setter_profile_id UUID NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  roster_date DATE NOT NULL,
  assigned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_profile_id, roster_date)
);

-- Indexes
CREATE INDEX idx_roster_entries_date ON public.roster_entries(roster_date);
CREATE INDEX idx_roster_entries_setter ON public.roster_entries(setter_profile_id);
CREATE INDEX idx_roster_clients_manager ON public.roster_clients(manager_user_id);

-- Enable RLS
ALTER TABLE public.roster_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_entries ENABLE ROW LEVEL SECURITY;

-- RLS for roster_clients: managers see their own, admins see all
CREATE POLICY "Managers can manage their own roster clients"
ON public.roster_clients FOR ALL
TO authenticated
USING (
  manager_user_id = auth.uid()
  OR public.is_admin_role(auth.uid())
  OR public.has_role(auth.uid(), 'sdr_manager')
);

-- RLS for roster_entries: managers, admins, and assigned setters can view
CREATE POLICY "Managers and admins can manage roster entries"
ON public.roster_entries FOR ALL
TO authenticated
USING (
  public.is_admin_role(auth.uid())
  OR public.has_sdr_manager_role(auth.uid())
  OR setter_profile_id IN (SELECT id FROM public.setters_profiles WHERE user_id = auth.uid())
);

-- Trigger to update updated_at
CREATE TRIGGER update_roster_entries_updated_at
BEFORE UPDATE ON public.roster_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Notify setter when roster entry is created
CREATE OR REPLACE FUNCTION public.notify_roster_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_setter_user_id UUID;
  v_setter_role app_role;
  v_client_name TEXT;
  v_day_name TEXT;
BEGIN
  -- Get setter user_id
  SELECT user_id INTO v_setter_user_id
  FROM setters_profiles WHERE id = NEW.setter_profile_id;

  -- Get setter role
  SELECT role INTO v_setter_role
  FROM user_roles WHERE user_id = v_setter_user_id LIMIT 1;

  -- Get client name
  SELECT company_name INTO v_client_name
  FROM client_profiles WHERE id = NEW.client_profile_id;

  -- Get day name
  v_day_name := TO_CHAR(NEW.roster_date, 'Day, Mon DD');

  IF v_setter_user_id IS NOT NULL AND v_setter_role IS NOT NULL THEN
    INSERT INTO notifications (
      recipient_id, recipient_role, title, message, category, link_url, triggered_by
    ) VALUES (
      v_setter_user_id,
      v_setter_role,
      'Roster Assignment',
      'You have been assigned to ' || COALESCE(v_client_name, 'a client') || ' on ' || TRIM(v_day_name),
      'system',
      '/setter',
      NEW.assigned_by
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_roster_assignment
AFTER INSERT ON public.roster_entries
FOR EACH ROW
EXECUTE FUNCTION public.notify_roster_assignment();
