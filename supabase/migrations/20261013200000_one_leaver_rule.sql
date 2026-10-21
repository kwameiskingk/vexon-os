-- ═══════════════════════════════════════════════════════════════════════════
-- One leaver rule (13 Oct 2026, the owner: "people keep popping up where they
-- shouldn't, for six months").
--
-- profiles.offboarded_at is THE "has left" flag. setters_profiles.active is
-- the bench flag (a setter can be paused without leaving). Until now nothing
-- kept them in step: seven setters deactivated before the offboarding page
-- existed had active=false but no leaving date, so every screen that reads
-- the leaving date alone still called them current. Their dates were
-- stamped by hand today (last login). This migration stops it recurring:
--
--   1. is_current_staff(uid): the one SQL predicate for "still with us".
--   2. Trigger: stamping offboarded_at benches the setter row automatically,
--      so the old flag can never say "working" for a leaver again.
--   3. Backfill: any setter row still active for an offboarded profile is
--      benched now (expected: 0 rows).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_current_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND offboarded_at IS NULL);
$$;
COMMENT ON FUNCTION public.is_current_staff(uuid) IS
  'True while profiles.offboarded_at is NULL. The single "still with us" rule; setters_profiles.active is only the bench flag.';

CREATE OR REPLACE FUNCTION public.sync_setter_bench_on_offboard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.offboarded_at IS NOT NULL AND (OLD.offboarded_at IS NULL OR OLD.offboarded_at IS DISTINCT FROM NEW.offboarded_at) THEN
    UPDATE public.setters_profiles SET active = false WHERE user_id = NEW.id AND active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_setter_bench_on_offboard ON public.profiles;
CREATE TRIGGER trg_sync_setter_bench_on_offboard
  AFTER UPDATE OF offboarded_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_setter_bench_on_offboard();

UPDATE public.setters_profiles sp
   SET active = false
  FROM public.profiles p
 WHERE p.id = sp.user_id AND p.offboarded_at IS NOT NULL AND sp.active = true;

-- Verification ----------------------------------------------------------------
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_sync_setter_bench_on_offboard') AS trigger_ok,
  (SELECT count(*) FROM pg_proc WHERE proname = 'is_current_staff') AS fn_ok,
  (SELECT count(*) FROM public.setters_profiles sp JOIN public.profiles p ON p.id = sp.user_id WHERE p.offboarded_at IS NOT NULL AND sp.active) AS leavers_still_active,
  (SELECT string_agg(p.full_name, ', ') FROM public.setters_profiles sp JOIN public.profiles p ON p.id = sp.user_id WHERE p.offboarded_at IS NULL AND sp.active = false) AS benched_not_left;
