-- ============================================================
-- Phone screen capture: candidate_phone_screens
-- One row = Elena's live phone screen of one screened candidate.
-- Human-entered only; the CV screening agent never touches this table.
-- Approved 2026-08-12: accent + birth-year fields DROPPED — the
-- 2026-08-07 no-demographics ruling stands as written, no exception.
-- Q-numbering after the drop: Q1-Q9 below; Q10 (Notes) reuses
-- cv_screenings.ops_notes, no column here.
-- Apply manually via the hosted SQL editor — never supabase db push.
-- Safe to re-run: all statements guarded.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.candidate_phone_screens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cv_screening_id uuid NOT NULL UNIQUE
    REFERENCES public.cv_screenings(id) ON DELETE CASCADE,

  -- The questions, in call order. Everything nullable: fields are
  -- filled progressively during a live call and partial saves must work.
  b2b_cold_calling_last_6mo boolean,                          -- Q1
  what_they_sell text,                                        -- Q2
  countries_sold_into text,                                   -- Q3
  avg_dials_per_day integer CHECK (avg_dials_per_day >= 0),   -- Q4
  pct_cold_leads integer CHECK (pct_cold_leads BETWEEN 0 AND 100),  -- Q5
  pct_warm_leads integer CHECK (pct_warm_leads BETWEEN 0 AND 100),  -- Q5
  avg_appointments_per_month numeric CHECK (avg_appointments_per_month >= 0),  -- Q6
  years_b2b_cold_calling numeric CHECK (years_b2b_cold_calling >= 0),          -- Q7
  has_equipment boolean,                                      -- Q8
  notice_period text,                                         -- Q9 (phone-confirmed; CV-claimed stays on cv_screenings.notice_period_raw)

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.candidate_phone_screens ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_candidate_phone_screens_updated_at
  ON public.candidate_phone_screens;
CREATE TRIGGER update_candidate_phone_screens_updated_at
  BEFORE UPDATE ON public.candidate_phone_screens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: byte-for-byte the cv_screenings lanes (ops capability + admin tier).
DROP POLICY IF EXISTS "Ops command manages phone screens" ON public.candidate_phone_screens;
CREATE POLICY "Ops command manages phone screens" ON public.candidate_phone_screens
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ops_command'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ops_command'));

DROP POLICY IF EXISTS "Admin tier manages phone screens" ON public.candidate_phone_screens;
CREATE POLICY "Admin tier manages phone screens" ON public.candidate_phone_screens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'dev'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
              OR public.has_role(auth.uid(), 'dev'::public.app_role));

-- setter, csm, sdr_manager, client, anon: deliberately no policy,
-- same as cv_screenings.
