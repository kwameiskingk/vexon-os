// Client bookings administration — the STAFF half of the client-calendar
// story. Serves the CSM client-profile Config → Bookings section and the Dev
// Center. Routed through a function (service role) so CSMs need no new RLS
// on the booking tables.
//   overview        client_profile_id → event + rules + connection + bookings
//   create_event    client_profile_id → event from the fulfilment template
//                   (+ client host row + starter availability windows)
//   save_rules      client_profile_id, rules[] → replace availability windows
//   toggle_event    event_id, field, value → is_active / accepting_bookings
//   update_event    event_id → provider, room link, phone choice, timezone lock
//   send_connect    client_profile_id[, email] → branded Resend connect email
//   booking_slots   client_profile_id[, days] → open slots on the client's own
//                   calendar (free/busy checked, Google or Microsoft)
//   cancel_booking  client_profile_id, booking_id → clears it from the
//                   client's calendar and voids its reminders
//   rebook_booking  client_profile_id, booking_id, starts_at → books the new
//                   time, then retires the old one

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { cancelBooking, runBookingFlow, sendResendEmail } from "../_shared/booking-flow.ts";
import { computeSlots } from "../_shared/slot-engine.ts";
import { CALLBACK_MINUTES, callbackDays, callbackNoticeMinutes, isCallbackBooking } from "../_shared/callback.ts";
import { LEGAL_LINE } from "../_shared/legalEntity.ts";

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

const ALLOWED_ROLES = ["dev", "admin", "ops", "csm", "sdr_manager"];
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://vexon-os.example";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function connectEmailHtml(clientName: string, connectUrl: string) {
  const name = escapeHtml(clientName);
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background-color:#9e9e9e;background:linear-gradient(135deg,#dedede 0%,#9e9e9e 50%,#6b7a90 100%);border-radius:16px;padding:28px 30px;color:#0f0f11;">
      <img src="https://vexon-os.example/brand/vexon-logo-white.png" width="120" alt="Vexon OS" style="display:block;width:120px;height:auto;border:0;" />
      <h1 style="margin:8px 0 0;font-size:22px;">Connect your calendar ✓</h1>
    </div>
    <div style="background:#ffffff;border:1px solid #e3e3e6;border-radius:16px;padding:26px 30px;margin-top:16px;color:#111113;">
      <p style="margin:0 0 14px;">Hi ${name} team,</p>
      <p style="margin:0 0 14px;">We book your meetings through <strong>Vexon OS Bookings</strong>. Connecting your calendar takes under a minute and means:</p>
      <ul style="margin:0 0 14px;padding-left:20px;color:#5f5f66;">
        <li>meetings land straight in your calendar,</li>
        <li>we only ever offer times you're genuinely free,</li>
        <li>no more double bookings.</li>
      </ul>
      <p style="margin:0 0 18px;"><a href="${connectUrl}" style="display:inline-block;background:#3d5a80;background:linear-gradient(90deg,#3d5a80,#5a5a5a);color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 26px;font-weight:700;">Connect my calendar →</a></p>
      <p style="margin:0;color:#5f5f66;font-size:13px;">Works with Google Workspace and Microsoft 365 (Outlook + Teams) — you'll approve a standard permission screen for whichever you use. We can only see when you're busy and add the meetings we book — never read your emails or event details. Questions? Just reply to your account manager.</p>
    </div>
    <p style="text-align:center;color:#5f5f66;font-size:11px;margin-top:14px;">Powered by Vexon OS Bookings<br/>${LEGAL_LINE}</p>
  </div></body></html>`;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const randomSuffix = () => crypto.randomUUID().replace(/-/g, "").slice(0, 6);

// Clients whose conferencing Google can't create (Teams, Zoom) supply their
// own standing room link instead; see _shared/booking-flow.ts.
const LOCATION_TYPES = ["google_meet", "teams", "zoom", "phone", "in_person"];
const TIMEZONES = [
  "Europe/London", "Europe/Dublin", "Europe/Madrid", "Europe/Amsterdam",
  "Europe/Paris", "Europe/Berlin", "Asia/Dubai", "Africa/Johannesburg",
  "America/New_York", "America/Chicago", "America/Los_Angeles", "UTC",
];

// Daniel's standard client-event windows (the shape almost every client gave).
const STARTER_WINDOWS = [
  { weekday: 1, start_time: "11:00", end_time: "17:00" },
  { weekday: 2, start_time: "09:00", end_time: "17:00" },
  { weekday: 3, start_time: "09:00", end_time: "17:00" },
  { weekday: 4, start_time: "09:00", end_time: "17:00" },
  { weekday: 5, start_time: "09:00", end_time: "16:00" },
];

// The one shared description every client discovery call carries (Daniel).
const STANDARD_CLIENT_DESCRIPTION = `📅 Purpose of the Call:
This 30-minute call is designed to understand your hiring needs and explore how we can help you find the right talent to grow your business.
📌 What We'll Cover:
1. An introduction to our expertise and recruitment solutions.
2. Insights into your hiring goals, challenges, and timelines.
3. Tailored strategies to meet your talent acquisition needs.
4. Answering any questions about our recruitment process.
✅ Preparation for the Call:
– Identify key roles or hiring challenges you'd like to discuss.
– Think about your ideal candidates and timelines.
💡 Benefit of This Call:
Gain clarity on how we can support your recruitment goals with tailored, results-driven solutions.
We look forward to helping you build your dream team!`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action;
    if (!action) return json({ error: "action is required" }, 400);

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
    if (!(roleRows ?? []).some((r) => ALLOWED_ROLES.includes(r.role as string))) {
      return json({ error: "Access denied" }, 403);
    }

    const clientProfileId = typeof body.client_profile_id === "string" ? body.client_profile_id : null;
    const loadClient = async () => {
      if (!clientProfileId) return null;
      const { data } = await supabase
        .from("client_profiles").select("id, company_name, email, logo")
        .eq("id", clientProfileId).maybeSingle();
      return data;
    };

    if (action === "overview") {
      const client = await loadClient();
      if (!client) return json({ error: "Client not found" }, 404);
      const [{ data: event }, { data: rules }, { data: connection }] = await Promise.all([
        supabase.from("booking_event_types")
          .select("id, slug, name, is_active, accepting_bookings, duration_minutes, location_type, static_meeting_link, offer_phone_choice, lock_timezone, callback_notice_minutes")
          .eq("client_id", client.id).order("created_at").limit(1).maybeSingle(),
        supabase.from("booking_availability_rules")
          .select("id, weekday, start_time, end_time, timezone, buffer_minutes, min_notice_minutes")
          .eq("client_profile_id", client.id).is("event_type_id", null).order("weekday"),
        supabase.from("calendar_connections")
          .select("status, provider, calendar_email, invited_at, connected_at, last_error")
          .eq("client_profile_id", client.id).maybeSingle(),
      ]);
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, prospect_name, prospect_email, starts_at, status, prospect_confirmed_at, google_event_id, created_at, location_choice")
        .eq("client_profile_id", client.id)
        .order("starts_at", { ascending: false })
        .limit(20);
      return json({
        client: { id: client.id, name: client.company_name, email: client.email, logo: client.logo },
        event: event || null,
        rules: rules || [],
        connection: connection || null,
        bookings: bookings || [],
      });
    }

    if (action === "create_event") {
      const client = await loadClient();
      if (!client) return json({ error: "Client not found" }, 404);
      const { data: existing } = await supabase
        .from("booking_event_types").select("id").eq("client_id", client.id).limit(1);
      if (existing && existing.length > 0) {
        return json({ error: "This client already has a booking event" }, 409);
      }
      const slug = `client-${slugify(client.company_name)}-${randomSuffix()}`;
      // UK-only clients stay locked to London; a client working other markets
      // is created with no lock so the prospect picks their own timezone.
      const tz = TIMEZONES.includes(body.timezone) ? body.timezone : "Europe/London";
      const lockTz = body.lock_timezone === null
        ? null
        : TIMEZONES.includes(body.lock_timezone) ? body.lock_timezone : tz;
      const provider = LOCATION_TYPES.includes(body.location_type)
        ? body.location_type : "google_meet";
      const { data: event, error: evErr } = await supabase
        .from("booking_event_types")
        .insert({
          name: `${client.company_name} Discovery Call`,
          slug,
          description: STANDARD_CLIENT_DESCRIPTION,
          duration_minutes: 30,
          side: "fulfilment",
          is_active: true,
          accepting_bookings: true,
          round_robin: false,
          staff_mode: true,
          lock_timezone: lockTz,
          questions: [],
          location_type: provider,
          static_meeting_link: String(body.static_meeting_link || "").slice(0, 500) || null,
          offer_phone_choice: true,
          client_id: client.id,
        })
        .select("id, slug, name, is_active, accepting_bookings, duration_minutes, location_type, static_meeting_link, offer_phone_choice, lock_timezone, callback_notice_minutes")
        .single();
      if (evErr) return json({ error: evErr.message }, 500);
      await supabase.from("booking_event_hosts").insert({
        event_type_id: event.id,
        client_profile_id: client.id,
        external_email: client.email || null,
        external_name: client.company_name,
        priority: 1,
      });
      // Starter windows matching the shape most clients gave Daniel (Mon
      // 11–17, Tue–Thu 9–17, Fri 9–16) so the event is immediately usable —
      // the client's real windows replace them.
      const { data: hasRules } = await supabase
        .from("booking_availability_rules").select("id")
        .eq("client_profile_id", client.id).is("event_type_id", null).limit(1);
      if (!hasRules || hasRules.length === 0) {
        await supabase.from("booking_availability_rules").insert(
          STARTER_WINDOWS.map(({ weekday, start_time, end_time }) => ({
            client_profile_id: client.id,
            weekday, start_time, end_time,
            timezone: tz, buffer_minutes: 15, min_notice_minutes: 120,
          }))
        );
      }
      return json({ event, starter_rules: true });
    }

    if (action === "save_rules") {
      const client = await loadClient();
      if (!client) return json({ error: "Client not found" }, 404);
      const raw = Array.isArray(body.rules) ? body.rules.slice(0, 21) : [];
      // One timezone per save. Hardcoding London here used to reset a
      // non-UK client (e.g. DMD, Dubai) every time a CSM touched their hours.
      const saveTz = TIMEZONES.includes(body.timezone) ? body.timezone : "Europe/London";
      const rules = raw
        .map((r: any) => ({
          client_profile_id: client.id,
          weekday: Number(r?.weekday),
          start_time: String(r?.start_time || "").slice(0, 5),
          end_time: String(r?.end_time || "").slice(0, 5),
          timezone: saveTz,
          buffer_minutes: Math.max(0, Math.min(120, Number(r?.buffer_minutes) || 0)),
          min_notice_minutes: Math.max(0, Math.min(10080, Number(r?.min_notice_minutes) || 0)),
        }))
        .filter((r: any) =>
          Number.isInteger(r.weekday) && r.weekday >= 0 && r.weekday <= 6 &&
          /^\d{2}:\d{2}$/.test(r.start_time) && /^\d{2}:\d{2}$/.test(r.end_time) &&
          r.start_time < r.end_time
        );
      // Host-level edits only — never touch per-event override rows.
      await supabase.from("booking_availability_rules")
        .delete().eq("client_profile_id", client.id).is("event_type_id", null);
      if (rules.length > 0) {
        const { error } = await supabase.from("booking_availability_rules").insert(rules);
        if (error) return json({ error: error.message }, 500);
      }
      return json({ saved: rules.length });
    }

    if (action === "toggle_event") {
      const eventId = typeof body.event_id === "string" ? body.event_id : null;
      const field = body.field;
      if (!eventId || !["is_active", "accepting_bookings"].includes(field)) {
        return json({ error: "event_id and a valid field are required" }, 400);
      }
      const { error } = await supabase
        .from("booking_event_types")
        .update({ [field]: body.value === true })
        .eq("id", eventId)
        .not("client_id", "is", null); // guard: only client events via this fn
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // Where the meeting happens: provider, the client's own room link, the
    // video-or-phone choice, and whether prospects may pick their timezone.
    if (action === "update_event") {
      const eventId = typeof body.event_id === "string" ? body.event_id : null;
      if (!eventId) return json({ error: "event_id is required" }, 400);
      const patch: Record<string, unknown> = {};
      if (LOCATION_TYPES.includes(body.location_type)) {
        patch.location_type = body.location_type;
      }
      if (typeof body.static_meeting_link === "string") {
        patch.static_meeting_link = body.static_meeting_link.trim().slice(0, 500) || null;
      }
      if (typeof body.offer_phone_choice === "boolean") {
        patch.offer_phone_choice = body.offer_phone_choice;
      }
      // 16 Oct (the owner): how soon a callback can be booked, in minutes (0 to a day).
      if (body.callback_notice_minutes !== undefined) {
        const n = Number(body.callback_notice_minutes);
        if (!Number.isInteger(n) || n < 0 || n > 1440) {
          return json({ error: "Callback notice must be a whole number of minutes, 0 to 1440" }, 400);
        }
        patch.callback_notice_minutes = n;
      }
      // null is meaningful: it unlocks the timezone selector for the prospect.
      if (body.lock_timezone === null || TIMEZONES.includes(body.lock_timezone)) {
        patch.lock_timezone = body.lock_timezone;
      }
      if (Object.keys(patch).length === 0) {
        return json({ error: "Nothing to update" }, 400);
      }
      const { error } = await supabase
        .from("booking_event_types")
        .update(patch)
        .eq("id", eventId)
        .not("client_id", "is", null); // guard: only client events via this fn
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "send_connect") {
      const client = await loadClient();
      if (!client) return json({ error: "Client not found" }, 404);
      const toEmail = (typeof body.email === "string" && /\S+@\S+\.\S+/.test(body.email))
        ? body.email.trim()
        : client.email;
      if (!toEmail) return json({ error: "This client has no email on their profile — add one or pass an address" }, 422);

      const token = crypto.randomUUID().replace(/-/g, "");
      const { data: existing } = await supabase
        .from("calendar_connections").select("id, status")
        .eq("client_profile_id", client.id).maybeSingle();
      if (existing?.status === "connected") {
        return json({ error: "This client is already connected" }, 409);
      }
      if (existing) {
        await supabase.from("calendar_connections")
          .update({ connect_token: token, invited_at: new Date().toISOString(), status: "invited" })
          .eq("id", existing.id);
      } else {
        await supabase.from("calendar_connections").insert({
          owner_type: "client",
          client_profile_id: client.id,
          provider: "google",
          status: "invited",
          calendar_email: toEmail,
          connect_token: token,
          invited_at: new Date().toISOString(),
        });
      }
      const connectUrl = `${APP_ORIGIN}/connect-calendar#ct=${token}`;
      const send = await sendResendEmail(
        toEmail,
        `Connect your calendar to Meridian bookings`,
        connectEmailHtml(client.company_name, connectUrl)
      );
      if (!send.ok) {
        // 16 Sep: "The email provider rejected the connect email" told us
        // nothing while the connect test was failing — Resend's actual reason
        // (restricted key, unverified domain, bad from) was being thrown away.
        // Surface it; the CSM sees a generic toast either way, but the reason
        // now reaches the logs and the response body.
        console.error("[send_connect] resend rejected", { to: toEmail, error: send.error });
        return json({
          error: send.attempted
            ? "The email provider rejected the connect email"
            : "Email sending isn't configured (RESEND_API_KEY)",
          provider_error: send.error,
          connect_url: connectUrl, // staff can still copy the link manually
        }, 502);
      }
      return json({ sent: true, to: toEmail, connect_url: connectUrl });
    }

    // ── Fulfilment rebooking (16 Sep) ───────────────────────────────────
    // A client booking that has to move had no home before this: the setters'
    // Rebook flow is built around meetings and an assigned AE, and a client
    // event's host row carries client_profile_id with host_user_id NULL, so
    // booking-availability and booking-create both reject it. The CSM's only
    // path was the Dev Centre cancel plus re-booking by hand on the public
    // page. These three actions give Daniel the same power the setters have,
    // scoped to his own clients by the role gate above.

    /** The client event + its host row — every action below needs both. */
    const loadClientEvent = async (clientId: string) => {
      const { data: eventType } = await supabase
        .from("booking_event_types")
        .select("*, booking_event_hosts(host_user_id, client_profile_id, host_calendar_email)")
        .eq("client_id", clientId)
        .maybeSingle();
      if (!eventType) return null;
      const host = (eventType.booking_event_hosts || [])
        .find((h: { client_profile_id: string | null }) => h.client_profile_id);
      return host ? { eventType, host } : null;
    };

    /** 16 Oct: the booking being moved, when it is a callback on this client
     * (moves stay within today and the next two working days, 15 minutes). */
    const loadCallbackBeingMoved = async (clientId: string, eventType: { client_id?: string | null }) => {
      const id = typeof body.booking_id === "string" ? body.booking_id : "";
      if (!id) return null;
      const { data: b } = await supabase
        .from("bookings").select("id, client_profile_id, location_choice, starts_at, ends_at")
        .eq("id", id).maybeSingle();
      return b && b.client_profile_id === clientId && isCallbackBooking(eventType, b.location_choice) ? b : null;
    };

    if (action === "booking_slots") {
      const client = await loadClient();
      if (!client) return json({ error: "Client not found" }, 404);
      const found = await loadClientEvent(client.id);
      if (!found) return json({ error: "This client has no booking event yet" }, 404);
      const callbackBooking = await loadCallbackBeingMoved(client.id, found.eventType);
      try {
        const result = await computeSlots(
          supabase, found.eventType, { clientProfileId: client.id },
          callbackBooking
            ? {
                callback: { dayKeys: callbackDays(), noticeMinutes: callbackNoticeMinutes(found.eventType) },
                ignore: { bookingId: callbackBooking.id, startsAt: callbackBooking.starts_at, endsAt: callbackBooking.ends_at },
              }
            : { days: Math.min(Number(body.days) || 21, 31) }
        );
        return json({
          ...result,
          duration_minutes: callbackBooking ? CALLBACK_MINUTES : found.eventType.duration_minutes,
          callback: !!callbackBooking,
        });
      } catch (e) {
        // Never present busy time as free: a calendar failure is an error,
        // not an empty list.
        console.error("[booking-client-admin] slots:", e);
        return json({ error: "Could not check the client's calendar — try again shortly" }, 502);
      }
    }

    if (action === "cancel_booking") {
      const client = await loadClient();
      if (!client) return json({ error: "Client not found" }, 404);
      const bookingId = typeof body.booking_id === "string" ? body.booking_id : "";
      const { data: booking } = await supabase
        .from("bookings").select("id, client_profile_id, status")
        .eq("id", bookingId).maybeSingle();
      // Scope check: this function is the CLIENT admin surface, so it must
      // never become a way to cancel an acquisition booking.
      if (!booking || booking.client_profile_id !== client.id) {
        return json({ error: "That booking doesn't belong to this client" }, 404);
      }
      const result = await cancelBooking(
        supabase, booking.id,
        (typeof body.reason === "string" && body.reason.trim()) || "cancelled by the CSM"
      );
      if (!result.ok) return json({ error: result.error }, 409);
      return json(result);
    }

    if (action === "rebook_booking") {
      const client = await loadClient();
      if (!client) return json({ error: "Client not found" }, 404);
      const bookingId = typeof body.booking_id === "string" ? body.booking_id : "";
      const startsAt = typeof body.starts_at === "string" ? body.starts_at : "";
      if (!startsAt) return json({ error: "A new time is required" }, 400);

      const { data: old } = await supabase
        .from("bookings")
        .select("id, client_profile_id, meeting_id, prospect_name, prospect_email, prospect_mobile, answers, location_choice, prospect_timezone, status, callback_backup_times, starts_at, ends_at")
        .eq("id", bookingId).maybeSingle();
      if (!old || old.client_profile_id !== client.id) {
        return json({ error: "That booking doesn't belong to this client" }, 404);
      }
      const found = await loadClientEvent(client.id);
      if (!found) return json({ error: "This client has no booking event yet" }, 404);

      // A callback keeps its backup times that are still ahead, and its title
      // still names the prospect's company (held on the meeting).
      let companyName: string | null = null;
      if (old.meeting_id) {
        const { data: m } = await supabase.from("meetings").select("company_name").eq("id", old.meeting_id).maybeSingle();
        companyName = m?.company_name || null;
      }
      // A callback moves only to a free callback time (today and the next two
      // working days, UK), and keeps only backups that are still free callback
      // times, so the client is never told to ring when they are busy.
      let backupsAhead: string[] = [];
      if (isCallbackBooking(found.eventType, old.location_choice)) {
        let callbackSlots: string[];
        try {
          const r = await computeSlots(supabase, found.eventType, { clientProfileId: client.id }, {
            callback: { dayKeys: callbackDays(), noticeMinutes: callbackNoticeMinutes(found.eventType) },
            ignore: { bookingId: old.id, startsAt: old.starts_at, endsAt: old.ends_at },
          });
          callbackSlots = r.slots.map((s) => s.starts_at);
        } catch (e) {
          console.error("[booking-client-admin] callback slots:", e);
          return json({ error: "Could not check the client's calendar — try again shortly" }, 502);
        }
        const wanted = new Date(startsAt).toISOString();
        if (!callbackSlots.includes(wanted)) {
          return json({ error: "A callback can only move to a free time today or in the next two working days (UK time)" }, 409);
        }
        backupsAhead = ((old.callback_backup_times || []) as string[])
          .map((t) => new Date(t).toISOString())
          .filter((t) => t !== wanted && callbackSlots.includes(t));
      }

      // Book the new slot FIRST. If it fails — slot taken, calendar down —
      // the prospect still has their original meeting, which is the outcome
      // we'd want on every bad day.
      const result = await runBookingFlow(supabase, {
        eventType: found.eventType,
        host: found.host,
        startsAt,
        prospectName: old.prospect_name,
        prospectEmail: old.prospect_email,
        prospectMobile: old.prospect_mobile,
        answers: old.answers || {},
        meetingId: old.meeting_id || null,
        rebookedFromId: old.id,
        locationChoice: old.location_choice || null,
        prospectTimezone: old.prospect_timezone || null,
        source: "admin",
        createdBy: user.id,
        bookedByLabel: `by ${user.email || "the CSM"}`,
        companyName,
        callbackBackupTimes: backupsAhead,
      });
      if (!result.ok) return json({ error: result.error }, result.status || 409);

      // Only now retire the old one. Unlike the acquisition rebook (Marcus's
      // 21 Aug ruling, where the original invite deliberately survives), a
      // client's calendar must not keep a meeting that isn't happening —
      // that's the double-booking this whole feature exists to prevent.
      // cancelBooking removes the event from the client's own calendar,
      // Google or Microsoft, and voids the old reminders.
      const cancelled = await cancelBooking(supabase, old.id, "rebooked by the CSM");

      return json({
        ok: true,
        booking_id: result.booking_id,
        old_cancelled: cancelled.ok,
        old_calendar_cleared: cancelled.calendar_cancelled,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[booking-client-admin]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
