-- Ops hiring pipeline (N15/N16/N17): five-stage progression tracked on
-- candidates, orthogonal to the existing status lifecycle (status keeps its
-- pending/passed/failed/invited_to_interview/in_onboarding/hired CHECK).
-- Stages: 1 LCT Booked · 2 CEO Trial Call · 3 SDR Manager Interview ·
-- 4 Offer Letter · 5 Accepted. Stage dates persist as the candidate
-- advances, so "reached stage X" = that stage's date is non-null:
--   N15 final interviews booked = sdr_interview_date in window
--   N16 interview→offer %       = offer_letter_date ÷ sdr_interview cohort
--   N17 offer acceptance %      = accepted_date ÷ offer_letter cohort
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS pipeline_stage integer CHECK (pipeline_stage BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS lct_booked_date date,
  ADD COLUMN IF NOT EXISTS ceo_trial_call_date date,
  ADD COLUMN IF NOT EXISTS sdr_interview_date date,
  -- offer_letter_date is stamped automatically when a candidate enters the
  -- Offer Letter stage; wage/start date are the recruiter-entered terms,
  -- locked in by the Accepted stage (which only records accepted_date).
  ADD COLUMN IF NOT EXISTS offer_letter_date date,
  ADD COLUMN IF NOT EXISTS offer_wage numeric,
  ADD COLUMN IF NOT EXISTS offer_start_date date,
  ADD COLUMN IF NOT EXISTS accepted_date date;

-- The pipeline is worked by ops/HR, admin, and dev (all already covered by
-- the is_admin_role ALL policy) plus the SDR manager, who currently has no
-- candidates access at all. Setters remain excluded.
DROP POLICY IF EXISTS "SDR manager can view candidates" ON public.candidates;
CREATE POLICY "SDR manager can view candidates"
ON public.candidates FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'sdr_manager'));

DROP POLICY IF EXISTS "SDR manager can update candidates" ON public.candidates;
CREATE POLICY "SDR manager can update candidates"
ON public.candidates FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'sdr_manager'))
WITH CHECK (public.has_role(auth.uid(), 'sdr_manager'));
