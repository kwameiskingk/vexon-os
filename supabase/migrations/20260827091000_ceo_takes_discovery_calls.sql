-- Marcus takes over discovery + follow-up calls (27 Aug 2026).
--
-- Business context (Marcus's instruction, relayed by the owner): Oliver Grant
-- (AE) is leaving and will be offboarded today; Rory Carter (the other AE) is
-- converted to an acquisition setter. Marcus (admin) conducts all discovery
-- and follow-up calls himself for now.
--
-- BOOKKEEPING FILE: this SQL was applied to production via the the hosted builder MCP on
-- 27 Aug 2026 before this file merged. Idempotent — safe to re-run.

-- ── 1. Marcus becomes the sole host of both shared discovery events ────────
-- (staff cold-call event + public ads event). His existing default
-- availability rules (Mon-Fri 09:00-17:00 Europe/London, buffer 0, 2h notice)
-- apply, and the slot engine intersects them with his live Google calendar.
DELETE FROM public.booking_event_hosts
 WHERE event_type_id IN (
         SELECT id FROM public.booking_event_types
          WHERE slug IN ('discovery-call-with-recruitment-revenue', 'discovery-call')
       )
   AND host_user_id IN (
         'cfd78996-a3c9-461a-8756-bdc70ede5203',  -- Rory Carter
         '193e5c2a-0171-4325-860c-29826d58fc8e'   -- Oliver Grant
       );

INSERT INTO public.booking_event_hosts (event_type_id, host_user_id, host_calendar_email, priority)
SELECT e.id, 'a59995b2-0ecd-4aa0-8698-a8399d4423dd', 'marcus@meridiansales.example', 1
  FROM public.booking_event_types e
 WHERE e.slug IN ('discovery-call-with-recruitment-revenue', 'discovery-call')
ON CONFLICT (event_type_id, host_user_id) DO NOTHING;

UPDATE public.booking_event_types
   SET round_robin = false, updated_at = now()
 WHERE slug IN ('discovery-call-with-recruitment-revenue', 'discovery-call')
   AND round_robin = true;

-- ── 2. Oliver's personal booking links turned OFF ─────────────────────────
-- (his public pages 404; the resolver in useBookingEvent skips inactive
-- events). He is NOT offboarded by this migration — that happens in the app.
UPDATE public.booking_event_types
   SET is_active = false, updated_at = now()
 WHERE slug IN ('discovery-call-with-william', 'follow-up-with-william')
   AND is_active = true;

-- ── 3. Retired shared follow-up event: drop stale Rory/Oliver host rows ───
-- (follow-up-call-msp-t6v3x is already inactive; personal per-AE events
-- replaced it on 26 Aug).
DELETE FROM public.booking_event_hosts
 WHERE event_type_id IN (
         SELECT id FROM public.booking_event_types WHERE slug = 'follow-up-call-msp-t6v3x'
       )
   AND host_user_id IN (
         'cfd78996-a3c9-461a-8756-bdc70ede5203',
         '193e5c2a-0171-4325-860c-29826d58fc8e'
       );

-- ── 4. Marcus's personal follow-up event ───────────────────────────────────
-- Mirrors Oliver's from 20260826100000: the AE status modal (Sat — Follow Up
-- Booked / rebooked outcomes) resolves the meeting's AE — or the signed-in
-- user — to their own follow_up event, so Marcus's picker shows HIS live
-- times and the copy-link button hands out HIS public link.
INSERT INTO public.booking_event_types
  (name, slug, description, duration_minutes, questions, location_type, side, is_active,
   lock_timezone, round_robin, staff_mode, accepting_bookings, offer_phone_choice,
   invite_only, warn_personal_email, owner_user_id, event_purpose)
SELECT
  'Follow Up With Marcus', 'follow-up-with-marcus',
  'This is a follow-up call with Marcus to pick up where we left off.' || E'\n\n' ||
  'Pick whichever time suits you best and we''ll go through anything still outstanding, plus what the next steps look like.' || E'\n\n' ||
  'If you''re having trouble scheduling please email marcus@meridiansales.example',
  30, '[]'::jsonb, 'google_meet', 'acquisition', true,
  'Europe/London', false, false, true, false,
  false, true, 'a59995b2-0ecd-4aa0-8698-a8399d4423dd', 'follow_up'
WHERE NOT EXISTS (
  SELECT 1 FROM public.booking_event_types WHERE slug = 'follow-up-with-marcus'
);

INSERT INTO public.booking_event_hosts (event_type_id, host_user_id, host_calendar_email, priority)
SELECT id, 'a59995b2-0ecd-4aa0-8698-a8399d4423dd', 'marcus@meridiansales.example', 1
  FROM public.booking_event_types WHERE slug = 'follow-up-with-marcus'
ON CONFLICT (event_type_id, host_user_id) DO NOTHING;

-- ── 5. Oliver's three pending discovery meetings reassigned to Marcus ─────
-- All three were manually logged (no platform booking / calendar invite), so
-- this is purely an in-app reassignment. Guarded to the exact rows.
UPDATE public.meetings
   SET assigned_ae_id = 'a59995b2-0ecd-4aa0-8698-a8399d4423dd'
 WHERE id IN (
         '0e0ec426-425a-46f4-82eb-6db3fdb357a5',  -- Red Recruitment 24/7, 27 Aug 10:30
         'acc89ece-ac20-43d5-8994-fe8a36a99cc0',  -- Unbound Search,       27 Aug 11:30
         '998cf539-527d-490a-8d1a-428081d73323'   -- Atom Services Ltd,    28 Aug 15:00
       )
   AND assigned_ae_id = '193e5c2a-0171-4325-860c-29826d58fc8e';

-- ── 6. Rory Carter: account executive → acquisition setter ───────────────────
-- Role row converted in place (his setters_profiles row already exists from
-- the AE record-keeping migration; the setter-role trigger's ON CONFLICT
-- insert is a no-op). His AE history stays on his user id — deliberately not
-- rewritten.
UPDATE public.user_roles
   SET role = 'setter'
 WHERE user_id = 'cfd78996-a3c9-461a-8756-bdc70ede5203'
   AND role = 'account_executive';

UPDATE public.setters_profiles
   SET department = 'acquisition'
 WHERE user_id = 'cfd78996-a3c9-461a-8756-bdc70ede5203'
   AND department = 'sales';
