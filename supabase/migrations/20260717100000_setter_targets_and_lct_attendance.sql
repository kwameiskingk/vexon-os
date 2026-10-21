-- Per-setter targets (Build D): governance for the four existing target
-- columns on setters_profiles. Targets move to their own table so RLS can
-- gate writes to CEO/dev (has_role admin|dev) while staff read. Values are
-- backfilled per setter; the legacy columns stop being read or written by
-- the app after this build and are dropped in a later cleanup.
CREATE TABLE IF NOT EXISTS public.setter_targets (
  setter_profile_id uuid PRIMARY KEY
    REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  daily_dials_target integer NOT NULL DEFAULT 150,
  daily_meetings_target integer NOT NULL DEFAULT 2,
  daily_talk_time_target integer NOT NULL DEFAULT 90,
  weekly_meetings_target integer NOT NULL DEFAULT 6,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_setter_targets_updated_at
BEFORE UPDATE ON public.setter_targets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.setter_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view setter targets"
ON public.setter_targets FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
  OR public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'sdr_manager')
);

CREATE POLICY "CEO and dev manage setter targets"
ON public.setter_targets FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
);

-- Backfill: carry every setter's current targets over. Rows that still sit
-- on the untouched OLD column defaults (150/2/120/50 — the 50-meetings-a-week
-- stale first guess) translate to the approved canonical defaults (150/2/90/6);
-- any row a human has changed in any field is carried over verbatim.
INSERT INTO public.setter_targets (
  setter_profile_id, daily_dials_target, daily_meetings_target,
  daily_talk_time_target, weekly_meetings_target
)
SELECT id,
  COALESCE(daily_dials_target, 150),
  COALESCE(daily_meetings_target, 2),
  CASE WHEN (daily_dials_target, daily_meetings_target,
             daily_talk_time_target, weekly_meetings_target) = (150, 2, 120, 50)
       THEN 90 ELSE COALESCE(daily_talk_time_target, 90) END,
  CASE WHEN (daily_dials_target, daily_meetings_target,
             daily_talk_time_target, weekly_meetings_target) = (150, 2, 120, 50)
       THEN 6 ELSE COALESCE(weekly_meetings_target, 6) END
FROM public.setters_profiles
ON CONFLICT (setter_profile_id) DO NOTHING;

COMMENT ON COLUMN public.setters_profiles.daily_dials_target IS
  'DEPRECATED: moved to setter_targets (2026-07-16). Do not read or write.';
COMMENT ON COLUMN public.setters_profiles.daily_meetings_target IS
  'DEPRECATED: moved to setter_targets (2026-07-16). Do not read or write.';
COMMENT ON COLUMN public.setters_profiles.daily_talk_time_target IS
  'DEPRECATED: moved to setter_targets (2026-07-16). Do not read or write.';
COMMENT ON COLUMN public.setters_profiles.weekly_meetings_target IS
  'DEPRECATED: moved to setter_targets (2026-07-16). Do not read or write.';

-- LCT attendance (W17): real attended/no-show capture on candidates.
-- NULL = not recorded (legacy rows keep the verdict-proxy fallback).
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS lct_attendance text
  CHECK (lct_attendance IS NULL OR lct_attendance IN ('attended', 'no_show'));
