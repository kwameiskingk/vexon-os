-- Acquisition conditional qualification follow-ups (Marcus, 2026-08-25):
--   1. Revenue Under £300,000 → "Are they price qualified?" + required reason
--   2. TAM (1,000+ companies in sector) = No → required reason to proceed
--   3. Only decision maker = No → who else + how they're involved; NEW
--      involvement option 'attending_instead' (the phone contact nominates
--      someone to attend the discovery in their place; that person is invited)
--   4. Start timeline "In more than a month" → required reason
--
-- decision_maker_email / decision_maker_status are REUSED from the fulfilment
-- build (20260824120000); acquisition adds the name and the extra status.
-- Reasons live in these columns + meeting notes + bookings.answers ONLY —
-- never in calendar event descriptions (privacy ruling, 24 Aug).
--
-- Apply via the hosted SQL editor (never `supabase db push`); add
-- 20260825130000 to the migration repair list. Idempotent.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS price_qualified boolean,
  ADD COLUMN IF NOT EXISTS price_qualified_reason text,
  ADD COLUMN IF NOT EXISTS tam_reason text,
  ADD COLUMN IF NOT EXISTS start_timeline_reason text,
  ADD COLUMN IF NOT EXISTS decision_maker_name text;

-- Extend the fulfilment-era CHECK with 'attending_instead'. The constraint was
-- created inline on ADD COLUMN, so Postgres auto-named it.
ALTER TABLE public.meetings
  DROP CONSTRAINT IF EXISTS meetings_decision_maker_status_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_decision_maker_status_check
  CHECK (decision_maker_status IS NULL OR decision_maker_status IN
    ('joining','briefed_by_prospect','email_pending','attending_instead'));
