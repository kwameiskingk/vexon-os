// The reminder cron for the booking platform. Runs every 5 minutes (see
// 20260819130000_booking_reminders_cron.sql): picks up due pending rows from
// booking_notifications (written at booking time: reminder_24h / reminder_3h,
// email + SMS per prospect), sends them, and records sent/failed per row —
// the Dev Center notification log reads exactly this. Reminders for
// cancelled/rescheduled bookings are marked cancelled, never sent.
//
// 9 Oct 2026: the same run also repairs upcoming Meet bookings whose Google
// event exists but never received its Meet link (Google mints the conference
// asynchronously and occasionally answers before it is ready — Harvey Stone,
// 7 Oct). The sweep reads the event, asks Google for a Meet if it still has
// none, and writes the link back to the booking and its meetings row, so the
// reminders that follow carry it.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { VEXON_BOOKINGS_CALENDAR, sendResendEmail, sendTwilioSms } from "../_shared/booking-flow.ts";
import { getAccessToken, getClientCalendarAccess, repairMeetLink } from "../_shared/google-calendar.ts";
import {
  clientFromAddress, loadTemplates, renderEmail, renderSms, templateVars,
  type TemplateKey, type Templates,
} from "../_shared/kronos-messages.ts";
import { isCallbackBooking } from "../_shared/callback.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Upcoming confirmed Meet bookings with a calendar event but no link: fetch or
 * mint the link and backfill it. Returns {checked, repaired}. Capped per run;
 * anything left waits for the next five-minute tick. */
async function repairMissingMeetLinks(supabase: any): Promise<{ checked: number; repaired: number }> {
  const { data: rows, error } = await supabase
    .from("bookings")
    .select("id, event_type_id, host_user_id, client_profile_id, google_event_id, meeting_id, location_choice, booking_event_types(location_type)")
    .eq("status", "confirmed")
    .is("google_meet_link", null)
    .not("google_event_id", "is", null)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(10);
  if (error) {
    console.error("[meet-repair] query:", error);
    return { checked: 0, repaired: 0 };
  }
  let checked = 0, repaired = 0;
  for (const b of rows || []) {
    // Only events that are meant to carry a Meet: phone/in-person events and
    // one-off phone bookings have no link by design; Teams/Zoom carry a static one.
    if (b.booking_event_types?.location_type !== "google_meet" || b.location_choice === "phone") continue;
    checked++;
    try {
      let token: string | null = null;
      let calendarEmail: string | null = null;
      if (b.client_profile_id) {
        const access = await getClientCalendarAccess(supabase, b.client_profile_id);
        if (access?.provider === "microsoft") continue; // Teams, not Meet
        if (access) { token = access.token; calendarEmail = access.calendarEmail; }
        else { calendarEmail = VEXON_BOOKINGS_CALENDAR(); token = await getAccessToken(calendarEmail); }
      } else if (b.host_user_id) {
        const { data: host } = await supabase
          .from("booking_event_hosts")
          .select("host_calendar_email")
          .eq("event_type_id", b.event_type_id)
          .eq("host_user_id", b.host_user_id)
          .maybeSingle();
        if (host?.host_calendar_email) {
          calendarEmail = host.host_calendar_email as string;
          token = await getAccessToken(calendarEmail);
        }
      }
      if (!token || !calendarEmail) {
        console.warn(`[meet-repair] booking ${b.id}: no calendar access to repair`);
        continue;
      }
      const link = await repairMeetLink(token, calendarEmail, b.google_event_id);
      if (!link) {
        console.warn(`[meet-repair] booking ${b.id}: Google still has no Meet link`);
        continue;
      }
      await supabase.from("bookings").update({ google_meet_link: link }).eq("id", b.id);
      if (b.meeting_id) {
        await supabase.from("meetings").update({ google_meet_link: link }).eq("id", b.meeting_id);
      }
      repaired++;
      console.log(`[meet-repair] booking ${b.id}: Meet link backfilled`);
    } catch (e) {
      console.error(`[meet-repair] booking ${b.id}:`, e);
    }
  }
  return { checked, repaired };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // In-code gate (the deploy pipeline ships functions without platform JWT
  // verification): the cron job calls with the anon-key Bearer
  // (20260819130000); a signed-in staff JWT also passes. This is a tripwire
  // against blind unauthenticated drive-bys, not a secret — and the sweep
  // itself is idempotent (rows are claimed per run), so an early trigger
  // gains an attacker nothing.
  const authHeader = req.headers.get("Authorization") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (authHeader !== `Bearer ${anonKey}`) {
    const probe = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await probe.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Meet-link repair first, so a reminder due this very run carries the link.
  const meetRepair = await repairMissingMeetLinks(supabase);

  const { data: due } = await supabase
    .from("booking_notifications")
    .select("*, bookings(id, status, starts_at, prospect_name, prospect_mobile, google_meet_link, host_user_id, event_type_id, location_choice)")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(50);

  let sent = 0, failed = 0, cancelled = 0;
  const templateCache = new Map<string, Templates>();

  for (const n of due || []) {
    const booking = (n as any).bookings;

    // Never remind about a booking that's no longer happening (or already past).
    if (!booking || booking.status !== "confirmed" ||
        new Date(booking.starts_at).getTime() < Date.now()) {
      await supabase.from("booking_notifications")
        .update({ status: "cancelled", error: "booking not confirmed at send time" })
        .eq("id", n.id);
      cancelled++;
      continue;
    }

    const [{ data: eventType }, { data: hostProfile }] = await Promise.all([
      supabase.from("booking_event_types")
        .select("name, client_id, client_profiles(company_name, logo, email)").eq("id", booking.event_type_id).maybeSingle(),
      supabase.from("profiles")
        .select("full_name").eq("id", booking.host_user_id).maybeSingle(),
    ]);
    const eventName = eventType?.name || "meeting";
    // Client bookings have no host user. 6 Oct: "with Meridian", never "with your
    // host"; 8 Oct (the owner): a client's prospect hears the client's name.
    const client = (eventType as any)?.client_profiles || null;
    const hostName = hostProfile?.full_name || client?.company_name || "Meridian";

    // 16 Oct (the owner): the wording comes from Dev Centre > Kronos > Message
    // copy, per event. reminder_1h rows queued before 6 Oct use the 3-hour
    // wording; none are pending today.
    if (!templateCache.has(booking.event_type_id)) {
      templateCache.set(booking.event_type_id, await loadTemplates(supabase, booking.event_type_id));
    }
    const templates = templateCache.get(booking.event_type_id)!;
    const moment = n.template === "reminder_24h" ? "reminder_24h" : "reminder_3h";
    const key = `${moment}_${n.channel === "email" ? "email" : "sms"}` as TemplateKey;
    const template = templates[key];
    if (!template.enabled) {
      await supabase.from("booking_notifications")
        .update({ status: "cancelled", error: "switched off in Dev Centre > Kronos > Message copy" })
        .eq("id", n.id);
      cancelled++;
      continue;
    }
    // 16 Oct: a callback's reminder says "your callback with …" and who will ring.
    const callback = isCallbackBooking(eventType, booking.location_choice);
    const vars = templateVars({
      prospectName: booking.prospect_name, eventName, withName: hostName,
      startsAt: booking.starts_at, meetLink: booking.google_meet_link, prospectMobile: booking.prospect_mobile,
      callback,
    });

    let result;
    if (n.channel === "email") {
      const mail = renderEmail(template, vars, {
        meetLink: booking.google_meet_link, brandName: hostName, clientLogo: client?.logo || null, callback,
      });
      result = await sendResendEmail(
        n.recipient, mail.subject, mail.html, undefined,
        // 8 Oct (the owner): a client's prospect replies to the client, never to Marcus.
        client ? { from: clientFromAddress(client.company_name), replyTo: client.email || undefined } : undefined,
      );
    } else {
      result = await sendTwilioSms(n.recipient, renderSms(template, vars));
    }

    if (result.ok) {
      await supabase.from("booking_notifications")
        .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
        .eq("id", n.id);
      sent++;
    } else {
      // not_configured stays pending (sends once secrets land); real errors fail.
      const stillPending = !result.attempted;
      await supabase.from("booking_notifications")
        .update(stillPending
          ? { error: "provider not configured yet" }
          : { status: "failed", error: String(result.error).slice(0, 500) })
        .eq("id", n.id);
      if (!stillPending) failed++;
    }
  }

  return new Response(
    JSON.stringify({ processed: (due || []).length, sent, failed, cancelled, meet_repair: meetRepair }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
