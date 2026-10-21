-- Acquisition qualification questions v2 (Marcus, 2026-08-19): the setter
-- Log Meeting form's Company Qualification section becomes
--   1. Revenue last 12 months  (existing column; new option bands split at
--      £300k so the "below £300k → price qualify" rule is expressible)
--   2. More than 1,000 companies in the target sector?  (No → disqualify)
--   3. Only decision maker in the company?
--   4. How soon would they start?  (>1 month → disqualify)
-- Company Headcount leaves the form; its column stays for historical
-- meetings, which keep displaying their old answers.
-- APPLIED to prod 2026-08-19 via the hosted SQL connection
-- (repair list: 20260819160000).

ALTER TABLE public.meetings
  ADD COLUMN sector_over_1000_companies boolean,
  ADD COLUMN only_decision_maker boolean,
  ADD COLUMN start_timeline text;
