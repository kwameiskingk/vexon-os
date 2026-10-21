// Manual booking cancellation. Two callers:
//  - Dev Center Bookings tab (admin tier) — cancel any booking by booking_id.
//  - The setter rebook flow — since the 21 Aug ruling the original calendar
//    invite survives a rebook, so the setter cancels it manually. They may
//    pass meeting_id (the latest active booking for that meeting is resolved
//    here) and may only cancel bookings THEY created.
// Removes the Google Calendar event (Google emails the cancellation to the
// prospect), marks the booking cancelled, and voids its pending reminders.
// mark_meeting_status ('rescheduled' | 'cancelled') optionally retires the
// linked meeting row — used when a setter releases one side of a rebook pair.
//
// delete_meeting (16 Oct 2026, the owner): a fulfilment setter's Delete on an
// appointment booked through Kronos. The live booking (if any) is cancelled
// first, so the client's calendar entry and the prospect's invite go; then
// the appointment itself is deleted. Allowed for the admin tier and for the
// setter credited with the meeting.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { cancelBooking } from "../_shared/booking-flow.ts";

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

const ADMIN_ROLES = ["dev", "admin", "ops"];
const MEETING_MARKS = ["rescheduled", "cancelled"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { booking_id, meeting_id, reason, mark_meeting_status, delete_meeting } = await req.json();
    if (!booking_id && !meeting_id) {
      return json({ error: "booking_id or meeting_id is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const authHeader = req.headers.get("Authorization") || "";
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const { data: roleRows } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roleRows ?? []).some((r) => ADMIN_ROLES.includes(r.role as string));

    if (delete_meeting === true) {
      if (!meeting_id) return json({ error: "meeting_id is required" }, 400);
      const meetingId = String(meeting_id);
      const { data: m } = await supabase
        .from("meetings").select("id, setter_id, logged_by_setter_id")
        .eq("id", meetingId).maybeSingle();
      if (!m) return json({ error: "That appointment no longer exists" }, 404);
      if (!isAdmin && m.setter_id !== user.id && m.logged_by_setter_id !== user.id) {
        return json({ error: "Access denied" }, 403);
      }
      // Database first, calendars last: a calendar cancellation emails the
      // prospect and can't be taken back, so it only happens once the
      // appointment is really gone.
      const { data: linked } = await supabase
        .from("bookings").select("id, status").eq("meeting_id", meetingId);
      const liveIds = (linked || []).filter((b) => ["held", "confirmed"].includes(b.status)).map((b) => b.id);
      const linkedIds = (linked || []).map((b) => b.id);
      // 1. Let go of the bookings (their history stays), so the row can go.
      if (linkedIds.length > 0) {
        const { error: detachErr } = await supabase.from("bookings").update({ meeting_id: null }).in("id", linkedIds);
        if (detachErr) return json({ error: detachErr.message }, 500);
      }
      // 2. A queued agreement for this appointment goes with it. The queue is
      // keyed on the discovery log, not the meeting, and that link is nulled
      // when the log cascades away, so note the queue rows first.
      const { data: logs } = await supabase.from("sales_discovery_logs").select("id").eq("meeting_id", meetingId);
      const logIds = (logs || []).map((l) => l.id);
      const { data: queued } = logIds.length > 0
        ? await supabase.from("agreement_send_queue").select("id").in("discovery_log_id", logIds)
        : { data: [] as Array<{ id: string }> };
      // 3. The appointment (its discovery logs cascade).
      const { error: delErr } = await supabase.from("meetings").delete().eq("id", meetingId);
      if (delErr) {
        // Put the bookings back; nothing on any calendar has been touched.
        if (linkedIds.length > 0) {
          await supabase.from("bookings").update({ meeting_id: meetingId }).in("id", linkedIds);
        }
        console.error("[booking-cancel] delete meeting:", delErr);
        return json({ error: `The appointment could not be deleted: ${delErr.message}. Nothing was cancelled.` }, 409);
      }
      const queuedIds = (queued || []).map((q) => q.id);
      if (queuedIds.length > 0) {
        const { error: qErr } = await supabase.from("agreement_send_queue").delete().in("id", queuedIds);
        if (qErr) console.error("[booking-cancel] agreement queue:", qErr);
      }
      // 4. Now take it off the calendars.
      const failed: string[] = [];
      let calendarsCleared = true;
      for (const id of liveIds) {
        const r = await cancelBooking(supabase, id, `appointment deleted by ${user.email || "a setter"}`);
        if (!r.ok) failed.push(id);
        else if (!r.calendar_cancelled) calendarsCleared = false;
      }
      return json({
        ok: true,
        deleted: true,
        bookings_cancelled: liveIds.length - failed.length,
        bookings_failed: failed,
        calendar_cancelled: liveIds.length > 0 && failed.length === 0 && calendarsCleared,
      });
    }

    // Resolve the booking: direct id, or the latest live booking on a meeting.
    let query = supabase
      .from("bookings")
      .select("id, created_by, meeting_id, status")
      .in("status", ["held", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1);
    query = booking_id
      ? query.eq("id", String(booking_id))
      : query.eq("meeting_id", String(meeting_id));
    const { data: booking } = await query.maybeSingle();
    if (!booking) return json({ error: "No active booking found to cancel" }, 404);

    // Gate: admin tier may cancel anything; anyone else only what they booked.
    if (!isAdmin && booking.created_by !== user.id) {
      return json({ error: "Access denied" }, 403);
    }

    const result = await cancelBooking(
      supabase, booking.id,
      (typeof reason === "string" && reason.trim()) || `cancelled by ${user.email || "staff"}`
    );
    if (!result.ok) return json({ error: result.error }, 404);

    if (
      typeof mark_meeting_status === "string" &&
      MEETING_MARKS.includes(mark_meeting_status) &&
      booking.meeting_id
    ) {
      await supabase.from("meetings")
        .update({ attendance_status: mark_meeting_status })
        .eq("id", booking.meeting_id);
    }

    return json(result);
  } catch (e) {
    console.error("[booking-cancel]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
