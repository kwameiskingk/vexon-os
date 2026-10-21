-- Internal meetings log — CEO "Meetings" tab (Marcus's ask, 2 Sep 2026) and the
-- same tab inside Elena's Ops Command (the owner's ruling 3 Sep: fully shared, no
-- confidentiality split — "Elena must be able to see everything").
--
-- Three tables:
--   internal_meetings          the recurring SERIES (e.g. "Core team morning call"):
--                              cadence, usual time/day, standing agenda, participants.
--   internal_meeting_logs      one row per occurrence that actually happened:
--                              agenda as run, notes, decisions, attendees, Fathom link.
--   internal_meeting_actions   tasks handed out in that occurrence; open ones can be
--                              carried forward into the next log (carried_to_log_id),
--                              mirroring coaching_action_items' carry pattern.
--
-- NOT related to public.meetings (client sales appointments) or coaching_sessions
-- (1:1 setter coaching). Nothing else reads these tables.
--
-- Access: new capability can_log_internal_meetings, seeded to roles admin + dev and
-- granted to Elena by user. Capability (not has_role) chosen on purpose so next
-- week's per-user permissions sweep can grant/revoke without a code change.
--
-- NOTE: applied by the owner via the hosted SQL editor; migration bookkeeping unaware.
--       Never `supabase db push` this file. Repair list:
--       supabase migration repair --status applied 20260903130000

CREATE TABLE public.internal_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cadence text NOT NULL,
  team text,                                   -- free label: fulfilment / sales / core / hr …
  weekday smallint,                            -- weekly: 1 = Monday … 7 = Sunday
  month_day smallint,                          -- monthly: 1..31
  default_time time,
  standing_agenda text,                        -- Marcus pastes the agenda he sends
  participant_user_ids uuid[] NOT NULL DEFAULT '{}',
  external_participants text,                  -- names/emails of non-platform attendees
  owner_user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT im_cadence CHECK (cadence IN ('daily','weekly','monthly','ad_hoc')),
  CONSTRAINT im_weekday CHECK (weekday IS NULL OR weekday BETWEEN 1 AND 7),
  CONSTRAINT im_month_day CHECK (month_day IS NULL OR month_day BETWEEN 1 AND 31)
);

CREATE TABLE public.internal_meeting_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.internal_meetings(id) ON DELETE CASCADE,
  held_on date NOT NULL,
  start_time time,
  duration_minutes integer,
  agenda text,                                 -- pre-filled from standing_agenda, editable
  notes text,                                  -- what happened
  decisions text,
  attendee_user_ids uuid[] NOT NULL DEFAULT '{}',
  attendee_notes text,
  fathom_link text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iml_one_per_day UNIQUE (meeting_id, held_on)
);

CREATE TABLE public.internal_meeting_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES public.internal_meeting_logs(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.internal_meetings(id) ON DELETE CASCADE,
  description text NOT NULL,
  assignee_user_id uuid,
  assignee_name text,                          -- for people not on the platform
  due_date date,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  carried_to_log_id uuid REFERENCES public.internal_meeting_logs(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ima_status CHECK (status IN ('open','done','carried')),
  CONSTRAINT ima_description CHECK (length(trim(description)) > 0)
);

CREATE INDEX idx_iml_meeting_day ON public.internal_meeting_logs (meeting_id, held_on DESC);
CREATE INDEX idx_iml_held_on ON public.internal_meeting_logs (held_on);
CREATE INDEX idx_ima_meeting_status ON public.internal_meeting_actions (meeting_id, status);
CREATE INDEX idx_ima_log ON public.internal_meeting_actions (log_id);
CREATE INDEX idx_ima_assignee ON public.internal_meeting_actions (assignee_user_id) WHERE status = 'open';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_meetings, public.internal_meeting_logs, public.internal_meeting_actions TO authenticated;
GRANT ALL ON public.internal_meetings, public.internal_meeting_logs, public.internal_meeting_actions TO service_role;

ALTER TABLE public.internal_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_meeting_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_meeting_actions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_internal_meetings_updated_at BEFORE UPDATE ON public.internal_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_internal_meeting_logs_updated_at BEFORE UPDATE ON public.internal_meeting_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_internal_meeting_actions_updated_at BEFORE UPDATE ON public.internal_meeting_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Meeting loggers manage series" ON public.internal_meetings
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_log_internal_meetings'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_log_internal_meetings'));
CREATE POLICY "Meeting loggers manage logs" ON public.internal_meeting_logs
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_log_internal_meetings'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_log_internal_meetings'));
CREATE POLICY "Meeting loggers manage actions" ON public.internal_meeting_actions
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_log_internal_meetings'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_log_internal_meetings'));

-- Capability: admin + dev by role, Elena by user (ops).
INSERT INTO public.role_capabilities (role, capability) VALUES
  ('admin','can_log_internal_meetings'),
  ('dev','can_log_internal_meetings')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_capabilities (user_id, capability, granted_by)
SELECT p.id, 'can_log_internal_meetings', 'a59995b2-0ecd-4aa0-8698-a8399d4423dd'
FROM public.profiles p
WHERE p.id = '916e451a-9e25-4e27-89ab-a5f3374d81ac' OR lower(p.email) = 'elena@meridiansales.example'
ON CONFLICT DO NOTHING;

-- Seed: Marcus's list (WhatsApp, 2 Sep), verbatim order within each cadence.
-- Times/days left NULL — Marcus sets them on the Agenda tab. Owner = Marcus.
DO $$
DECLARE
  v_ceo uuid := 'a59995b2-0ecd-4aa0-8698-a8399d4423dd';
BEGIN
  IF EXISTS (SELECT 1 FROM public.internal_meetings) THEN
    RAISE NOTICE 'internal_meetings already has rows — seed skipped';
    RETURN;
  END IF;

  INSERT INTO public.internal_meetings (name, cadence, team, sort_order, owner_user_id, created_by) VALUES
    ('Fulfilment team morning call',                    'daily',   'fulfilment', 10, v_ceo, v_ceo),
    ('Sales team morning call',                         'daily',   'sales',      20, v_ceo, v_ceo),
    ('Core team morning call',                          'daily',   'core',       30, v_ceo, v_ceo),
    ('Fulfilment team EOD call',                        'daily',   'fulfilment', 40, v_ceo, v_ceo),
    ('Sales team EOD call',                             'daily',   'sales',      50, v_ceo, v_ceo),
    ('Core team EOD call',                              'daily',   'core',       60, v_ceo, v_ceo),
    ('Weekly Client Success call',                      'weekly',  'csm',        110, v_ceo, v_ceo),
    ('Weekly HR call',                                  'weekly',  'hr',         120, v_ceo, v_ceo),
    ('Weekly SDR manager call',                         'weekly',  'fulfilment', 130, v_ceo, v_ceo),
    ('Weekly EA call',                                  'weekly',  'core',       140, v_ceo, v_ceo),
    ('Weekly CRM / forecasting call',                   'weekly',  'sales',      150, v_ceo, v_ceo),
    ('Weekly marketing call',                           'weekly',  'marketing',  160, v_ceo, v_ceo),
    ('Weekly accounting call',                          'weekly',  'accounting', 170, v_ceo, v_ceo),
    ('Monthly performance review (SDRs)',               'monthly', 'fulfilment', 210, v_ceo, v_ceo),
    ('Monthly performance review (HR)',                 'monthly', 'hr',         220, v_ceo, v_ceo),
    ('Monthly performance review (Dev)',                'monthly', 'dev',        230, v_ceo, v_ceo),
    ('Monthly performance review (CSM)',                'monthly', 'csm',        240, v_ceo, v_ceo),
    ('Monthly performance review (SDR Manager)',        'monthly', 'fulfilment', 250, v_ceo, v_ceo),
    ('Monthly performance review (AEs)',                'monthly', 'sales',      260, v_ceo, v_ceo),
    ('Monthly performance review (Marketing)',          'monthly', 'marketing',  270, v_ceo, v_ceo),
    ('Monthly accounting call',                         'monthly', 'accounting', 280, v_ceo, v_ceo),
    ('Monthly investment / partnership / refund call',  'monthly', 'core',       290, v_ceo, v_ceo);
END $$;
