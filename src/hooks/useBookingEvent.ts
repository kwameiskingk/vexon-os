import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * TA-portal booking events (Vexon OS Bookings engine, host: Marcus).
 * Unguessable slugs — active for the engine but unlisted publicly and
 * invisible to the setter wizard (registered on the fulfilment side).
 */
/** 22 Sep 2026: the Live Call Trial was retired and this event became the
 * Trial Day booking — host Elena, Tuesdays and Fridays only. The slug is
 * unchanged so no existing link or booking breaks. */
export const TRIAL_DAY_EVENT_SLUG = "live-call-trial-msp-k4n7p";
export const FINAL_INTERVIEW_EVENT_SLUG = "final-interview-msp-m8q2w";
export const FOLLOW_UP_EVENT_SLUG = "follow-up-call-msp-t6v3x";
/** The shared staff discovery event AEs are round-robin hosts on. */
export const STAFF_DISCOVERY_EVENT_SLUG = "discovery-call-with-recruitment-revenue";
/** Marcus's 30-min call-review slot for setter coaching (2 Sep). Internal —
 * invite_only, never listed; booked from the Log a Call Review modal so the
 * session lands on BOTH calendars and Google emails the setter the invite. */
export const CALL_REVIEW_EVENT_SLUG = "call-review-msp-s9x4m";

export type BookingEventInfo = {
  eventTypeId: string;
  hostUserId: string;
  durationMinutes: number;
  /** Public path segment — lets a caller share /bookings/<slug> directly. */
  slug: string;
} | null;

/** Resolves a booking event + a host for in-app pickers.
 * Multi-host events (e.g. the AE follow-up event, hosts Rory + Oliver) pick
 * the first `preferredHostIds` entry that IS a host of the event — so the
 * follow-up books onto the meeting's AE (or the signed-in AE) and each AE
 * sees their own live times. Falls back to the event's first host.
 * Returns null while loading or if the event is missing/off — callers fall
 * back to manual date/time entry, so a disabled event never blocks anyone. */
export function useBookingEvent(
  slug: string,
  preferredHostIds: Array<string | null | undefined> = []
) {
  const preferredKey = preferredHostIds.filter(Boolean).join(",");
  return useQuery<BookingEventInfo>({
    queryKey: ["booking-event-by-slug", slug, preferredKey],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("booking_event_types")
        .select("id, slug, duration_minutes, is_active, accepting_bookings, booking_event_hosts(host_user_id)")
        .eq("slug", slug)
        .maybeSingle();
      if (!data || !data.is_active || data.accepting_bookings === false) return null;
      const hosts = (data.booking_event_hosts || []) as Array<{ host_user_id: string }>;
      const preferredId = preferredHostIds.find(
        (id) => id && hosts.some((h) => h.host_user_id === id)
      );
      const host = preferredId
        ? hosts.find((h) => h.host_user_id === preferredId)!
        : hosts[0];
      if (!host) return null;
      return {
        eventTypeId: data.id as string,
        hostUserId: host.host_user_id as string,
        durationMinutes: data.duration_minutes as number,
        slug: data.slug as string,
      };
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * The follow-up event to use for a given AE.
 *
 * AEs can have their OWN personal follow-up event (owner_user_id + purpose
 * 'follow_up') — Oliver asked for one so he can bookmark it, send it from the
 * Close powerdialer, and have his portal picker show HIS live times rather
 * than a shared round-robin event. Falls back to the shared follow-up event
 * for AEs who have no personal one, so nothing changes for them.
 */
export function useFollowUpEventFor(aeUserId: string | null | undefined) {
  return usePersonalEventFor(aeUserId, "follow_up", FOLLOW_UP_EVENT_SLUG);
}

/** The discovery event to use for a given AE — their own where they have one,
 * otherwise the shared staff discovery event they are a host on. Used when an
 * AE reschedules a discovery themselves. */
export function useDiscoveryEventFor(aeUserId: string | null | undefined) {
  return usePersonalEventFor(aeUserId, "discovery", STAFF_DISCOVERY_EVENT_SLUG);
}

function usePersonalEventFor(
  aeUserId: string | null | undefined,
  purpose: "discovery" | "follow_up",
  fallbackSlug: string,
) {
  return useQuery<BookingEventInfo>({
    queryKey: ["personal-booking-event", purpose, aeUserId ?? "none"],
    queryFn: async () => {
      const load = async (match: { owner?: string; slug?: string }) => {
        let q = (supabase as any)
          .from("booking_event_types")
          .select("id, slug, duration_minutes, is_active, accepting_bookings, booking_event_hosts(host_user_id)");
        q = match.owner
          ? q.eq("owner_user_id", match.owner).eq("event_purpose", purpose)
          : q.eq("slug", match.slug);
        const { data } = await q.limit(1).maybeSingle();
        if (!data || !data.is_active || data.accepting_bookings === false) return null;
        const hosts = (data.booking_event_hosts || []) as Array<{ host_user_id: string }>;
        const host =
          hosts.find((h) => h.host_user_id === aeUserId) ?? hosts[0];
        if (!host) return null;
        return {
          eventTypeId: data.id as string,
          hostUserId: host.host_user_id as string,
          durationMinutes: data.duration_minutes as number,
          slug: data.slug as string,
        };
      };
      const own = aeUserId ? await load({ owner: aeUserId }) : null;
      return own ?? (await load({ slug: fallbackSlug }));
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/** Books a slot through the engine (calendar event on the host's calendar,
 * Google invite + SMS to the person, reminders queued). Returns a plain
 * result — callers decide how loudly to fail. */
export async function bookCandidateSlot(args: {
  eventTypeId: string;
  hostUserId: string;
  startsAt: string; // ISO UTC from the picker
  name: string;
  email: string;
  mobile?: string | null;
  /**
   * Extra lines shown in the calendar invite. Safe ONLY because the sole other
   * attendee is the candidate themselves — these are their own details, which
   * they already know.
   */
  inviteDetails?: Array<{ label: string; value: string | null | undefined }>;
  /**
   * Labelled Q&A rendered into the calendar-event description of STAFF
   * events (Marcus's 1 Sep ruling — he reads the screening answers in the
   * calendar popup, and confirmed the invitee sees them too). The server
   * drops these from client events and any ⚠-prefixed key.
   */
  answers?: Record<string, string>;
  /** Links the new booking to the meeting it replaces, so the engine can tie
   * the two together (and clears that meeting's setter-rebook flag). */
  rebookOfMeetingId?: string | null;
}): Promise<{ ok: boolean; error?: string; smsSent?: boolean; bookingId?: string }> {
  const { data, error } = await supabase.functions.invoke("booking-create", {
    body: {
      event_type_id: args.eventTypeId,
      host_user_id: args.hostUserId,
      starts_at: args.startsAt,
      prospect_name: args.name,
      prospect_email: args.email,
      prospect_mobile: args.mobile || "",
      invite_details: args.inviteDetails ?? null,
      answers: args.answers ?? {},
      rebook_of_meeting_id: args.rebookOfMeetingId ?? null,
      source: "admin",
    },
  });
  const failMsg = error?.message || data?.error;
  if (failMsg) return { ok: false, error: failMsg };
  // sms_sent=false with a mobile on the request means the person did NOT get
  // the confirmation text — callers surface that instead of a clean success.
  return {
    ok: true,
    smsSent: data?.sms_sent === true,
    bookingId: typeof data?.booking_id === "string" ? data.booking_id : undefined,
  };
}
