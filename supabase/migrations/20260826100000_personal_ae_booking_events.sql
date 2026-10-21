-- Personal AE booking events (Oliver, 26 Aug).
--
-- An AE can own a pair of links — a discovery call and a follow-up — that they
-- bookmark, send from the Close powerdialer, and hand to prospects so the
-- prospect picks a time against that AE's real availability.
--
--   owner_user_id  = the AE the link belongs to
--   event_purpose  = 'discovery' | 'follow_up'
--
-- The AE follow-up picker and the copy-a-link action resolve the signed-in
-- AE's own follow-up event first, falling back to the shared one, so AEs
-- without a personal event are unaffected.
--
-- Apply via the hosted SQL editor (never `supabase db push`); add
-- 20260826100000 to the migration repair list. Idempotent.

ALTER TABLE public.booking_event_types
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_purpose text;

ALTER TABLE public.booking_event_types
  DROP CONSTRAINT IF EXISTS booking_event_types_event_purpose_check;
ALTER TABLE public.booking_event_types
  ADD CONSTRAINT booking_event_types_event_purpose_check
  CHECK (event_purpose IS NULL OR event_purpose IN ('discovery','follow_up'));

CREATE INDEX IF NOT EXISTS idx_bet_owner_purpose
  ON public.booking_event_types (owner_user_id, event_purpose)
  WHERE owner_user_id IS NOT NULL;

-- Oliver's pair. The discovery link keeps its slug so anything already
-- shared or bookmarked keeps working; only the display name changes.
UPDATE public.booking_event_types
   SET name = 'Call With Oliver',
       owner_user_id = '193e5c2a-0171-4325-860c-29826d58fc8e',
       event_purpose = 'discovery'
 WHERE slug = 'discovery-call-with-william';

UPDATE public.booking_event_types
   SET owner_user_id = '193e5c2a-0171-4325-860c-29826d58fc8e',
       event_purpose = 'follow_up'
 WHERE slug = 'follow-up-with-william';
