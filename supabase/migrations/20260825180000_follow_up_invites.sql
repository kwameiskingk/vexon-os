-- Prospect self-booked follow-ups (the owner's ask, designed 25 Aug).
--
-- The AE copies a link and sends it in their own recap email; the prospect
-- picks a time themselves. The row's uuid PK IS the link token: unguessable,
-- single-use, expirable and revocable, so no PII travels in the URL and the
-- booking is locked to that AE's calendar.
--
-- Apply via the hosted SQL editor (never `supabase db push`); add
-- 20260825180000 to the migration repair list. Idempotent.

CREATE TABLE IF NOT EXISTS public.booking_follow_up_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_id uuid NOT NULL REFERENCES public.booking_event_types(id) ON DELETE CASCADE,
  host_user_id  uuid NOT NULL,                 -- locked host: the meeting's AE
  meeting_id    uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  -- Prefill snapshot, held server-side so the URL carries only the token.
  prospect_name   text,
  prospect_email  text,
  prospect_mobile text,
  company_name    text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  cancelled_at    timestamptz,
  used_booking_id uuid REFERENCES public.bookings(id),
  used_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bfi_meeting_id ON public.booking_follow_up_invites(meeting_id);
CREATE INDEX IF NOT EXISTS idx_bfi_created_by ON public.booking_follow_up_invites(created_by);

ALTER TABLE public.booking_follow_up_invites ENABLE ROW LEVEL SECURITY;

-- Reads: an AE sees their own invites; the admin tier sees all. Every WRITE
-- goes through a service-role edge function, so there are no write policies.
DROP POLICY IF EXISTS "AEs read own follow-up invites" ON public.booking_follow_up_invites;
CREATE POLICY "AEs read own follow-up invites"
ON public.booking_follow_up_invites
FOR SELECT
USING (created_by = auth.uid() OR is_admin_role(auth.uid()));

-- Distinct attribution for a booking the prospect made from an invite link.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_source_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_source_check
  CHECK (source IN ('setter', 'public', 'admin', 'invite'));

-- Events that may ONLY be booked through a tokenised link. Without this the
-- follow-up event's public URL would let anyone book an AE's calendar.
ALTER TABLE public.booking_event_types
  ADD COLUMN IF NOT EXISTS invite_only boolean NOT NULL DEFAULT false;
UPDATE public.booking_event_types
  SET invite_only = true
  WHERE slug = 'follow-up-call-msp-t6v3x';
