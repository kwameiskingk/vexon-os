// Move appointment (12 Oct 2026): move a live booking to a new time in place.
//   { booking_id } or { meeting_id }   plus   { starts_at }   (ISO instant, UTC)
// The booking row, the calendar event (same Meet link), the meetings row and
// the reminders all move together; the prospect gets a "moved" SMS and email.
// the hosted builder deploys every function with JWT verification off, so the caller is
// checked here: the signed-in user who created the booking, its host, or the
// admin tier (the same rule as booking-cancel). The slot must be free by the
// picker's own rules, with this booking's current slot ignored.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { computeSlots } from "../_shared/slot-engine.ts";
import { rescheduleBooking } from "../_shared/booking-flow.ts";
import { callbackDays, callbackNoticeMinutes, isCallbackBooking } from "../_shared/callback.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const ADMIN_ROLES = ["dev", "admin", "ops"];
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
// Keep in step with horizonDays() in booking-public.
function horizonDays(eventType: any): number {
  const fallback = eventType?.client_id ? 7 : 31;
  return Math.min(Math.max(Number(eventType?.booking_horizon_days) || fallback, 1), 365);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const bookingId = clip(body.booking_id, 40);
    const meetingId = clip(body.meeting_id, 40);
    const startsAtRaw = clip(body.starts_at, 40);
    if (!bookingId && !meetingId) return json({ error: "booking_id or meeting_id is required" }, 400);
    if (!startsAtRaw) return json({ error: "starts_at is required" }, 400);
    const startMs = Date.parse(startsAtRaw);
    if (!Number.isFinite(startMs)) return json({ error: "starts_at must be an ISO date and time" }, 400);
    if (startMs < Date.now()) return json({ error: "That time is in the past" }, 400);
    const newStartsAt = new Date(startMs).toISOString();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    let query = supabase
      .from("bookings")
      .select("id, status, event_type_id, host_user_id, client_profile_id, created_by, google_event_id, google_meet_link, starts_at, ends_at, meeting_id, prospect_name, prospect_email, prospect_mobile, shared_slot, location_choice, callback_backup_times")
      .in("status", ["held", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1);
    query = bookingId ? query.eq("id", bookingId) : query.eq("meeting_id", meetingId);
    const { data: booking } = await query.maybeSingle();
    if (!booking) return json({ error: "No active booking found to move" }, 404);

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roleRows ?? []).some((r: any) => ADMIN_ROLES.includes(r.role));
    if (!isAdmin && booking.created_by !== user.id && booking.host_user_id !== user.id) {
      // Setters may also move a meeting they are credited with, however it was booked.
      let allowed = false;
      if (booking.meeting_id) {
        const { data: m } = await supabase.from("meetings").select("setter_id, logged_by_setter_id").eq("id", booking.meeting_id).maybeSingle();
        allowed = !!m && (m.setter_id === user.id || m.logged_by_setter_id === user.id);
      }
      if (!allowed) return json({ error: "Access denied" }, 403);
    }

    const { data: eventType } = await supabase
      .from("booking_event_types")
      .select("*, booking_event_hosts(host_user_id, host_calendar_email, client_profile_id, external_name, external_email)")
      .eq("id", booking.event_type_id)
      .maybeSingle();
    if (!eventType) return json({ error: "Event type not found" }, 404);
    if (newStartsAt === new Date(booking.starts_at).toISOString()) return json({ error: "That is the time it is already booked for" }, 400);
    // 16 Oct: a callback moves within today and the next two working days
    // (UK); everything else within the event's own horizon.
    const isCallback = isCallbackBooking(eventType, booking.location_choice);
    const horizonMs = horizonDays(eventType) * 86_400_000;
    if (!isCallback && startMs > Date.now() + horizonMs) return json({ error: `That time is more than ${horizonDays(eventType)} days ahead` }, 409);

    // Same host the booking already has: client host for client events,
    // otherwise the staff host on the booking.
    const hosts: any[] = eventType.booking_event_hosts || [];
    const host = eventType.client_id
      ? hosts.find((h) => h.client_profile_id)
      : hosts.find((h) => h.host_user_id === booking.host_user_id);
    if (!host) return json({ error: "No host is set up for this event" }, 409);
    const hostRef = host.client_profile_id
      ? { clientProfileId: host.client_profile_id as string }
      : { hostUserId: host.host_user_id as string, calendarEmail: host.host_calendar_email as string | null };

    // The new slot must be one the picker would offer now, ignoring this
    // booking's own row and its own calendar entry. Three days around it.
    const dayStart = new Date(startMs - 86_400_000).toISOString().slice(0, 10);
    let avail;
    try {
      avail = await computeSlots(supabase, eventType, hostRef as any, {
        fromDate: dayStart, days: 3,
        ignore: { bookingId: booking.id, startsAt: booking.starts_at, endsAt: booking.ends_at },
        ...(isCallback ? { callback: { dayKeys: callbackDays(), noticeMinutes: callbackNoticeMinutes(eventType) } } : {}),
      });
    } catch (e) {
      console.error("[booking-reschedule] slot check failed:", e);
      return json({ error: "Could not check the calendar, try again shortly" }, 502);
    }
    if (!avail.slots.some((s) => s.starts_at === newStartsAt)) {
      return json({
        error: isCallback
          ? "That time is not free for a callback (today or the next two working days, UK time), pick another"
          : "That slot is no longer free, pick another time",
      }, 409);
    }

    const result = await rescheduleBooking(supabase, booking, eventType, newStartsAt);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json(result);
  } catch (e) {
    console.error("[booking-reschedule]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
