// Setter/admin booking creation (default verify_jwt — a signed-in user).
// The pipeline itself lives in _shared/booking-flow.ts, shared with
// booking-public: booking row (DB exclusion constraint = race guard),
// Google Calendar event + invite + Meet link, meetings-row sync,
// confirmation email/SMS when configured, 24h/1h reminder scheduling.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { runBookingFlow } from "../_shared/booking-flow.ts";
import { utcToZonedParts } from "../_shared/google-calendar.ts";

const BUSINESS_TZ = "Europe/London";

/**
 * A CLIENT login booking a fulfilment-side event (the in-portal "Catch-up
 * with Daniel", the onboarding call from the deck) is a client catch-up in
 * every sense the CSM tooling understands: CSMClients, WeeklyCatchupsTab,
 * useNativeClientHealth, catchup-notifications and the client's own
 * Communications page all read `client_catchups`, not `bookings`. Without
 * this mirror the client sees "No catch-ups scheduled" right after booking
 * and Daniel's trackers never learn about the call (review finding, 3 Sep).
 *
 * Best effort: the booking and the calendar invite already stand, so a
 * failure here is logged, never surfaced. Returns the catch-up id or null.
 * Staff bookings (no client profile on the caller) never mirror.
 */
// deno-lint-ignore no-explicit-any
async function mirrorClientCatchup(
  supabase: any,
  opts: { userId: string; eventType: { side?: string | null }; bookingId: string; startsAt: string },
): Promise<string | null> {
  try {
    if (opts.eventType.side !== "fulfilment") return null;
    const { data: linked } = await supabase
      .from("client_profile_users")
      .select("client_profile_id")
      .eq("user_id", opts.userId)
      .limit(1);
    let clientProfileId: string | null = linked?.[0]?.client_profile_id ?? null;
    if (!clientProfileId) {
      const { data: direct } = await supabase
        .from("client_profiles")
        .select("id")
        .eq("user_id", opts.userId)
        .maybeSingle();
      clientProfileId = direct?.id ?? null;
    }
    if (!clientProfileId) return null;

    const local = utcToZonedParts(opts.startsAt, BUSINESS_TZ);
    const { data, error } = await supabase
      .from("client_catchups")
      .insert({
        client_profile_id: clientProfileId,
        scheduled_date: local.date,
        scheduled_time: local.time,
        status: "scheduled",
        created_by: opts.userId,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[booking-create] client_catchups mirror:", error, { booking_id: opts.bookingId });
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.error("[booking-create] client_catchups mirror:", e, { booking_id: opts.bookingId });
    return null;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      event_type_id, host_user_id, starts_at,
      prospect_name, prospect_email, prospect_mobile,
      answers = {}, meeting_id = null, source = "setter", prospect_timezone = null,
      rebook_of_meeting_id = null, invite_details = null, guest_emails = null,
    } = await req.json();
    if (!event_type_id || !host_user_id || !starts_at) {
      return json({ error: "event_type_id, host_user_id and starts_at are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Who is booking (JWT arrives via the default verify_jwt gate).
    const authHeader = req.headers.get("Authorization") || "";
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const { data: eventType } = await supabase
      .from("booking_event_types")
      .select("*, booking_event_hosts(host_user_id, host_calendar_email)")
      .eq("id", event_type_id)
      .single();
    if (!eventType) return json({ error: "Event type not found" }, 404);
    if (!eventType.is_active) return json({ error: "Event type is not accepting bookings" }, 409);
    const host = (eventType.booking_event_hosts || []).find(
      (h: { host_user_id: string }) => h.host_user_id === host_user_id
    );
    if (!host) return json({ error: "This host is not assigned to this event type" }, 409);

    // 17 Sep (Marcus): no capacity for 5–10 more vacancies per month = disqualified.
    // The setter form blocks first; this keeps the rule true for any caller.
    const capacityAnswer = String(
      (answers && (answers["Capacity for 5–10 more vacancies per month"] ?? answers["Capacity for 5–10 more vacancies a month"])) ?? "",
    ).trim().toLowerCase();
    if (eventType.staff_mode && !eventType.client_id && capacityAnswer === "no") {
      return json({ error: "This prospect is disqualified based on the criteria — no capacity for an extra 5–10 vacancies per month" }, 422);
    }

    // Guests on the invitation (7 Sep, the client onboarding call): up to
    // five well-formed addresses, deduplicated, never the prospect twice.
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const guests: string[] = Array.isArray(guest_emails)
      ? [...new Set(
          guest_emails
            .map((g: unknown) => String(g ?? "").trim().toLowerCase())
            .filter((g: string) => g && emailRe.test(g) && g !== String(prospect_email || "").trim().toLowerCase()),
        )].slice(0, 5)
      : [];

    // Rebook: find the booking being replaced (if the original meeting was
    // booked through the platform) so the new booking links back to it.
    let oldBookingId: string | null = null;
    if (rebook_of_meeting_id) {
      const { data: oldBooking } = await supabase
        .from("bookings")
        .select("id")
        .eq("meeting_id", rebook_of_meeting_id)
        .in("status", ["held", "confirmed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      oldBookingId = oldBooking?.id || null;
    }

    const result = await runBookingFlow(supabase, {
      eventType,
      host: guests.length > 0 ? { ...host, extra_attendees: [...(host.extra_attendees || []), ...guests] } : host,
      startsAt: starts_at,
      prospectName: prospect_name,
      prospectEmail: prospect_email,
      prospectMobile: prospect_mobile,
      answers,
      meetingId: meeting_id,
      rebookedFromId: oldBookingId,
      source: source === "admin" ? "admin" : "setter",
      createdBy: user.id,
      // Attendee-safe lines for the invite description (candidate contact
      // details on the Live Call Trial / final interview). Never quals.
      inviteDetails: Array.isArray(invite_details) ? invite_details.slice(0, 8) : undefined,
      prospectTimezone: prospect_timezone,
      bookedByLabel: `by ${user.email || "a setter"}`,
    });

    if (!result.ok) return json({ error: result.error }, result.status);

    // The new booking is safe. Marcus's ruling (21 Aug): the ORIGINAL calendar
    // invite is NOT cancelled automatically — prospects sometimes revert to
    // the original time minutes later and the slot is valuable. Cancelling is
    // the setter's manual call (booking-cancel), offered by the UI afterwards.
    if (rebook_of_meeting_id) {
      await supabase.from("meetings")
        .update({ needs_setter_rebook: false })
        .eq("id", rebook_of_meeting_id);
    }

    // Client-booked fulfilment events also land in client_catchups so the
    // CSM catch-up tooling and the client's Communications page see them.
    const catchupId = await mirrorClientCatchup(supabase, {
      userId: user.id, eventType, bookingId: result.booking_id, startsAt: result.starts_at,
    });

    return json({
      ...result,
      catchup_id: catchupId,
      old_booking_id: oldBookingId,
      old_meeting_id: rebook_of_meeting_id,
    });
  } catch (e) {
    console.error("[booking-create]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
