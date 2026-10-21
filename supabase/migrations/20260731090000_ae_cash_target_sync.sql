-- AE cash-target sync: performance_goals → individual_targets (Phase 1,
-- 2026-07-31 ruling).
--
-- NOT applied by the assistant — the owner previews and applies.
--
-- RULING THIS ENACTS: Marcus's CEO Goals editor (/admin/ceo/goals, writing
-- performance_goals) remains the SINGLE entry point for AE cash targets.
-- The AE review engine's resolver reads individual_targets and is untouched;
-- this trigger keeps the two in step so the review always grades cash
-- against the CEO-set goal, with no second entry UI anywhere.
--
-- Mechanism: a table trigger (not app-side dual-write) so EVERY writer of
-- performance_goals — the CEO Goals editor today, the Goal Progress slider,
-- anything added later — syncs identically, and the CEO editor's code is
-- untouched.
--
-- Mapping (AE convention: individual_targets.subject_profile_id holds
-- profiles.id for non-setter roles):
--   subject_profile_id = performance_goals.user_id
--   role               = 'account_executive'
--   metric             = 'cash_collected'   (only this metric syncs)
--   period             = 'month'
--   target_value       = monthly_target
--   effective_from     = month  (always the 1st — enforce_month_first_day
--                        guarantees it), so a month's review, resolved at
--                        that month's end date, picks up that month's goal,
--                        and a future month's goal never leaks backwards.
--   updated_by         = set_by (who saved the goal)
-- Only role_type='ae' + metric='cash_collected' rows sync; setter
-- booked_meetings goals are untouched. DELETE of a goal removes the synced
-- row, so the resolver honestly reports "unset" rather than a stale target.
--
-- OWNERSHIP RULE (documented, relied on by the cleanup below): the sync is
-- the SOLE writer of (role='account_executive', metric='cash_collected')
-- rows in individual_targets. A manually-entered AE cash row with a later
-- effective_from would shadow the synced month-start row in the resolver
-- (latest effective_from wins) — the Phase 2 RLS denies the sdr_manager arm
-- exactly this metric, the Phase 2 UI does not offer cash, and the Dev
-- Center should not be used to write AE cash rows.

CREATE OR REPLACE FUNCTION public.sync_ae_cash_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role_type = 'ae' AND OLD.metric = 'cash_collected' THEN
      DELETE FROM public.individual_targets
      WHERE subject_profile_id = OLD.user_id
        AND role = 'account_executive'
        AND metric = 'cash_collected'
        AND period = 'month'
        AND effective_from = OLD.month;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.role_type = 'ae' AND NEW.metric = 'cash_collected' THEN
    INSERT INTO public.individual_targets
      (subject_profile_id, role, metric, period, target_value, effective_from, updated_by)
    VALUES
      (NEW.user_id, 'account_executive', 'cash_collected', 'month',
       NEW.monthly_target, NEW.month, NEW.set_by)
    ON CONFLICT (subject_profile_id, metric, period, effective_from)
    DO UPDATE SET target_value = EXCLUDED.target_value,
                  updated_by = EXCLUDED.updated_by,
                  updated_at = now();
    -- An UPDATE that moves a goal to a different month leaves the old
    -- month's synced row behind; handle it so the resolver never sees a
    -- stale month. (The CEO editor upserts on (user,metric,month) and never
    -- moves months, so this is belt-and-braces.)
    IF TG_OP = 'UPDATE' AND OLD.month IS DISTINCT FROM NEW.month
       AND OLD.role_type = 'ae' AND OLD.metric = 'cash_collected' THEN
      DELETE FROM public.individual_targets
      WHERE subject_profile_id = OLD.user_id
        AND role = 'account_executive'
        AND metric = 'cash_collected'
        AND period = 'month'
        AND effective_from = OLD.month;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS performance_goals_sync_ae_cash ON public.performance_goals;
CREATE TRIGGER performance_goals_sync_ae_cash
AFTER INSERT OR UPDATE OR DELETE ON public.performance_goals
FOR EACH ROW EXECUTE FUNCTION public.sync_ae_cash_target();

-- ── One-time reconciliation ─────────────────────────────────────────────────

-- 1. Remove the 2026-07-28 placeholder AE cash rows (entered by hand during
--    the review-engine build). They carry a later effective_from than the
--    month-start rows the sync writes, so the resolver would keep preferring
--    the £20k placeholders over Marcus's real goals. Per the ownership rule
--    above, the sync now owns this (role, metric) pair outright.
DELETE FROM public.individual_targets
WHERE role = 'account_executive' AND metric = 'cash_collected';

-- 2. Backfill from every existing AE cash goal (July 2026: Rory £30,000,
--    Oliver £50,000 — set 3 Jul, updated 16 Jul, via the CEO editor).
INSERT INTO public.individual_targets
  (subject_profile_id, role, metric, period, target_value, effective_from, updated_by)
SELECT user_id, 'account_executive', 'cash_collected', 'month',
       monthly_target, month, set_by
FROM public.performance_goals
WHERE role_type = 'ae' AND metric = 'cash_collected'
ON CONFLICT (subject_profile_id, metric, period, effective_from)
DO UPDATE SET target_value = EXCLUDED.target_value,
              updated_by = EXCLUDED.updated_by,
              updated_at = now();
