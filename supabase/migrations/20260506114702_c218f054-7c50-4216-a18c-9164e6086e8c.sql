-- Meeting Scores table (one-way Sheets → App sync)
CREATE TABLE IF NOT EXISTS public.meeting_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  meeting_date date NOT NULL,
  setter_name text NOT NULL,
  client_name text NOT NULL,
  prospect_company text NOT NULL DEFAULT '',
  fit smallint NOT NULL CHECK (fit BETWEEN 1 AND 5),
  engagement smallint NOT NULL CHECK (engagement BETWEEN 1 AND 5),
  authority smallint NOT NULL CHECK (authority BETWEEN 1 AND 5),
  next_step smallint NOT NULL CHECK (next_step BETWEEN 1 AND 5),
  notes text,
  overall_quality numeric GENERATED ALWAYS AS (
    ROUND(((fit + engagement + authority + next_step)::numeric) / 4.0, 2)
  ) STORED,
  matched boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent dedup key for re-syncs
CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_scores_dedup
  ON public.meeting_scores (
    meeting_date,
    lower(setter_name),
    lower(client_name),
    lower(prospect_company)
  );

CREATE INDEX IF NOT EXISTS idx_meeting_scores_appointment ON public.meeting_scores(appointment_id);
CREATE INDEX IF NOT EXISTS idx_meeting_scores_matched ON public.meeting_scores(matched);
CREATE INDEX IF NOT EXISTS idx_meeting_scores_lookup ON public.meeting_scores(lower(setter_name), lower(client_name), meeting_date);

CREATE TRIGGER trg_meeting_scores_updated_at
BEFORE UPDATE ON public.meeting_scores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.meeting_scores ENABLE ROW LEVEL SECURITY;

-- Admin / dev / ops / csm / sdr_manager: full read
CREATE POLICY "Staff can view all meeting scores"
ON public.meeting_scores FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
  OR public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'sdr_manager')
  OR public.has_role(auth.uid(), 'account_executive')
);

-- Setters can view scores tied to meetings they logged or own
CREATE POLICY "Setters view their own meeting scores"
ON public.meeting_scores FOR SELECT
TO authenticated
USING (
  appointment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_scores.appointment_id
      AND (m.setter_id = auth.uid() OR m.logged_by_setter_id = auth.uid())
  )
);

-- Clients can view scores tied to their own meetings
CREATE POLICY "Clients view their meeting scores"
ON public.meeting_scores FOR SELECT
TO authenticated
USING (
  appointment_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.meetings m
    JOIN public.client_profiles cp ON cp.id = m.client_profile_id
    LEFT JOIN public.client_profile_users cpu ON cpu.client_profile_id = cp.id
    WHERE m.id = meeting_scores.appointment_id
      AND (cp.user_id = auth.uid() OR cpu.user_id = auth.uid())
  )
);

-- No INSERT/UPDATE/DELETE policies → only service role (edge function) can write