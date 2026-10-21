-- Setter self-read on setter_weekly_goals — approved 2026-07-29.
-- The RAG weekly-goal overlay (PR #86) evaluates a manager-set weekly
-- Booked/SAT goal on the manager board; the setter's own pill runs the same
-- overlay but could not read the table (SELECT was manager-tier only), so
-- pill and board could disagree for the same week. This adds READ of a
-- setter's OWN rows only — no write, no visibility of other setters' goals.
-- Safe merge order: pre-migration the pill's goal query returns no rows and
-- the standing-target fallback applies.
-- NOTE: to be applied via the hosted builder SQL editor; migration bookkeeping unaware.
--       Never `supabase db push` this file. Add to the repair list:
--       supabase migration repair --status applied 20260729150000

CREATE POLICY "Setters read their own weekly goals"
  ON public.setter_weekly_goals
  FOR SELECT
  TO authenticated
  USING (setter_user_id = auth.uid());
