// The booking pipeline, shared by booking-create (setter flow) and
// booking-public (the /bookings/<slug> page): booking row (the DB exclusion
// constraint is the race guard), Google Calendar event (Google emails the
// invite; Meet link captured), optional meetings-row sync, confirmation
// email/SMS when providers are configured, and 24h/1h reminder scheduling.

// deno-lint-ignore-file no-explicit-any
import {
  getAccessToken, getClientCalendarAccess, createCalendarEvent, deleteCalendarEvent,
  listHostCalendarEvents, addHostCalendarGuests, removeHostCalendarGuest, moveCalendarEvent,
  utcToZonedParts,
} from "./google-calendar.ts";
import { createMsCalendarEvent, deleteMsCalendarEvent, moveMsCalendarEvent } from "./microsoft-calendar.ts";
import { LEGAL_LINE } from "./legalEntity.ts";
import { clientFromAddress, joinLabel, loadTemplates, renderEmail, renderSms, templateVars } from "./kronos-messages.ts";
import { CALLBACK_MINUTES, backupLabel, isCallbackBooking, londonDate } from "./callback.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

export const BUSINESS_TZ = "Europe/London";

/** Tier-1 client events live on this Meridian-owned calendar (the client and
 * prospect are invited by email). Overridable once a dedicated bookings
 * calendar user exists. */
export const VEXON_BOOKINGS_CALENDAR = () =>
  Deno.env.get("VEXON_BOOKINGS_CALENDAR") || "team@meridiansales.example";

// Branded confirmation email retired 2026-08-20 (Marcus/the owner): the Google
// Calendar invite is the confirmation. Kept only as the reminder templates'
// stylistic reference; reminders live in booking-send-reminders.
// joinLabel moved to kronos-messages.ts with the message copy (16 Oct 2026).

// deno-lint-ignore no-unused-vars
function confirmationEmailHtml(opts: {
  prospectName: string; eventName: string; whenLocal: string;
  hostName: string; meetLink: string | null; confirmUrl?: string | null;
}) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background-color:#9e9e9e;background:linear-gradient(135deg,#dedede 0%,#9e9e9e 50%,#6b7a90 100%);border-radius:16px;padding:28px 30px;color:#0f0f11;">
      <img src="https://vexon-os.example/brand/vexon-logo-white.png" width="120" alt="Vexon OS" style="display:block;width:120px;height:auto;border:0;" />
      <h1 style="margin:8px 0 0;font-size:22px;">You're booked in ✓</h1>
    </div>
    <div style="background:#ffffff;border:1px solid #e3e3e6;border-radius:16px;padding:26px 30px;margin-top:16px;color:#111113;">
      <p style="margin:0 0 14px;">Hi ${opts.prospectName || "there"},</p>
      <p style="margin:0 0 14px;">Your <strong>${opts.eventName}</strong> with <strong>${opts.hostName}</strong> is confirmed:</p>
      <p style="margin:0 0 14px;font-size:18px;font-weight:700;color:#2f4661;">${opts.whenLocal} (UK time)</p>
      ${opts.confirmUrl ? `<p style="margin:0 0 10px;"><a href="${opts.confirmUrl}" style="display:inline-block;background:#3d5a80;background:linear-gradient(90deg,#3d5a80,#5a5a5a);color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 26px;font-weight:700;">Confirm attendance ✓</a></p>` : ""}
      ${opts.meetLink ? `<p style="margin:0 0 14px;"><a href="${opts.meetLink}" style="display:inline-block;border:2px solid #3d5a80;color:#2f4661;text-decoration:none;border-radius:999px;padding:10px 22px;font-weight:700;">${joinLabel(opts.meetLink)}</a></p>` : ""}
      <p style="margin:0;color:#5f5f66;font-size:13px;">A calendar invitation has also been sent to this address — accept it and we'll see you there. Need to change the time? Just reply to this email.</p>
    </div>
    <p style="text-align:center;color:#5f5f66;font-size:11px;margin-top:14px;">Powered by Vexon OS Bookings<br/>${LEGAL_LINE}</p>
  </div></body></html>`;
}

export async function sendResendEmail(
  to: string, subject: string, html: string, text?: string,
  opts?: {
    from?: string;
    replyTo?: string;
    /** Base64 file attachments (payslip-send). Resend caps the email at 40 MB. */
    attachments?: Array<{ filename: string; content: string }>;
  },
) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { attempted: false, ok: false, error: "not_configured" };
  // send.meridiansales.example verified in Resend 16 Sep. The fallback is the live
  // brand, not the old one — if the secret ever goes missing, prospect
  // reminders must not silently start saying Meridian Sales Partners again.
  const from = opts?.from || Deno.env.get("RESEND_FROM") ||
    "Meridian <bookings@send.meridiansales.example>";
  // Our templates tell prospects "just reply to this email". Nothing was
  // setting reply_to, so those replies died at a send-only mailbox — including
  // "I can't make it any more", the one reply that needs a human fastest.
  // the owner, 16 Sep: acquisition replies go to Marcus, who reads them and tells
  // the setter to rebook.
  const replyTo = opts?.replyTo || Deno.env.get("RESEND_REPLY_TO") || "marcus@meridiansales.example";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [to], subject, html, reply_to: replyTo,
      ...(text ? { text } : {}),
      ...(opts?.attachments?.length ? { attachments: opts.attachments } : {}),
    }),
  });
  return { attempted: true, ok: res.ok, error: res.ok ? null : await res.text() };
}

/**
 * Best-effort E.164 normalisation (1 Sep). Twilio rejects anything that
 * isn't +<country><number>, and phone numbers reach us however a CV or a
 * TA typed them — "(076)379-1403" cost a real candidate her LCT reminder.
 * Local-format disambiguation: after a leading 0, SA mobiles have 9 digits,
 * UK mobiles 10 — the only two countries numbers realistically come from.
 * Anything we can't confidently fix passes through untouched so Twilio
 * still fails loudly into booking_notifications.error.
 */
export function normalizeMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (s === "") return null;
  s = s.replace(/[\s().\- ]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    return digits.length >= 8 ? "+" + digits : String(raw).trim();
  }
  const digits = s.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    const rest = digits.slice(1);
    if (rest.length === 9) return "+27" + rest;
    if (rest.length === 10) return "+44" + rest;
    return String(raw).trim();
  }
  if (/^(27|44)\d{9}$/.test(digits)) return "+" + digits;
  return String(raw).trim();
}

export async function sendTwilioSms(to: string, body: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) return { attempted: false, ok: false, error: "not_configured" };
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${token}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // Normalised here too: reminder sends replay booking_notifications
      // .recipient snapshots, which can predate normalisation.
      body: new URLSearchParams({ To: normalizeMobile(to) ?? to, From: from, Body: body }),
    }
  );
  return { attempted: true, ok: res.ok, error: res.ok ? null : await res.text() };
}

/** Cancels a held/confirmed booking: removes the Google Calendar event
 * (Google emails the cancellation to the prospect), marks the booking
 * cancelled, and voids its pending reminders. The meeting row is the
 * caller's business — rebooks mark it rescheduled, manual cancels decide
 * for themselves. */
export async function cancelBooking(
  supabase: any, bookingId: string, reason: string
): Promise<{ ok: boolean; calendar_cancelled: boolean; error?: string }> {
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, event_type_id, host_user_id, client_profile_id, google_event_id, shared_slot, prospect_email")
    .eq("id", bookingId)
    .in("status", ["held", "confirmed"])
    .maybeSingle();
  if (!booking) return { ok: false, calendar_cancelled: false, error: "No active booking found" };

  let calendarCancelled = false;
  if (booking.google_event_id && booking.shared_slot) {
    // 23 Sep 2026: a shared host entry stays; only this guest leaves it.
    const { data: host } = await supabase
      .from("booking_event_hosts")
      .select("host_calendar_email")
      .eq("event_type_id", booking.event_type_id)
      .eq("host_user_id", booking.host_user_id)
      .maybeSingle();
    if (host?.host_calendar_email && booking.prospect_email) {
      try {
        const t = await getAccessToken(host.host_calendar_email);
        if (t) {
          await removeHostCalendarGuest(t, host.host_calendar_email, booking.google_event_id, booking.prospect_email);
          calendarCancelled = true;
        }
      } catch (e) {
        console.error("[booking-flow] shared-slot guest removal:", e);
      }
    }
  } else if (booking.google_event_id) {
    // Client bookings: the event lives on the client's calendar (Tier 2 —
    // Google or Microsoft) or the Meridian bookings calendar (Tier 1). We don't
    // record which, so try both — deleting an id a calendar doesn't hold is a
    // harmless no-op.
    const targets: Array<{ token: string; email: string; provider: "google" | "microsoft" }> = [];
    if (booking.client_profile_id) {
      const access = await getClientCalendarAccess(supabase, booking.client_profile_id);
      if (access) targets.push({ token: access.token, email: access.calendarEmail, provider: access.provider });
      const vexonEmail = VEXON_BOOKINGS_CALENDAR();
      try {
        const t = await getAccessToken(vexonEmail);
        if (t) targets.push({ token: t, email: vexonEmail, provider: "google" });
      } catch (e) {
        console.error("[booking-flow] vexon calendar token:", e);
      }
    } else {
      const { data: host } = await supabase
        .from("booking_event_hosts")
        .select("host_calendar_email")
        .eq("event_type_id", booking.event_type_id)
        .eq("host_user_id", booking.host_user_id)
        .maybeSingle();
      if (host?.host_calendar_email) {
        try {
          const t = await getAccessToken(host.host_calendar_email);
          if (t) targets.push({ token: t, email: host.host_calendar_email, provider: "google" });
        } catch (e) {
          console.error("[booking-flow] host calendar token:", e);
        }
      }
    }
    for (const target of targets) {
      try {
        if (target.provider === "microsoft") {
          await deleteMsCalendarEvent(target.token, booking.google_event_id);
        } else {
          await deleteCalendarEvent(target.token, target.email, booking.google_event_id);
        }
        calendarCancelled = true;
      } catch (e) {
        // Cancellation still proceeds in our records; calendar failure reported.
        console.error("[booking-flow] calendar cancel:", e);
      }
    }
  }

  await supabase.from("bookings")
    .update({ status: "cancelled", cancelled_reason: reason })
    .eq("id", booking.id);
  await supabase.from("booking_notifications")
    .update({ status: "cancelled", error: reason })
    .eq("booking_id", booking.id)
    .eq("status", "pending");

  return { ok: true, calendar_cancelled: calendarCancelled };
}

/** The description of a callback's calendar event: who rings whom on which
 * number, and the backup times (16 Oct, the owner). Rewritten when it moves. */
function callbackNote(clientName: string | null | undefined, who: string, mobile: string | null, backupTimes: string[]) {
  return `CALLBACK: ${clientName || "We"} will call ${who}${mobile ? ` on ${mobile}` : ""}.\n\n` +
    (backupTimes.length > 0
      ? `If there is no answer, ${who} can also do: ${backupTimes.map(backupLabel).join("; ")} (UK time).\n\n`
      : "");
}

export type BookingFlowInput = {
  eventType: any;               // row incl. booking_event_hosts
  /** Staff host (host_user_id + host_calendar_email) OR client host
   * (client_profile_id + client_name/client_email). */
  host: {
    host_user_id?: string | null;
    host_calendar_email?: string | null;
    client_profile_id?: string | null;
    client_name?: string | null;
    client_email?: string | null;
    /** Additional invitees (e.g. a joining decision maker). */
    extra_attendees?: string[];
  };
  startsAt: string;             // ISO UTC
  prospectName?: string | null;
  prospectEmail?: string | null;
  prospectMobile?: string | null;
  answers?: Record<string, unknown>;
  meetingId?: string | null;    // meetings row to sync (setter flow)
  rebookedFromId?: string | null; // the booking this one replaces
  source: "setter" | "public" | "admin" | "invite";
  createdBy?: string | null;
  /** Per-booking choice on events that offer it (client discovery calls):
   * "phone" overrides the event's video setting for this booking only. */
  locationChoice?: "video" | "phone" | null;
  prospectTimezone?: string | null;
  /**
   * Extra lines for the calendar description. ONLY safe where every attendee
   * may see them — the invite has one description shared by everyone on it.
   * Used for the Live Call Trial / final interview, where the only other
   * attendee is the candidate themselves, so their own contact details are
   * safe. Since 1 Sep, `answers` also render into STAFF-event descriptions
   * (Marcus's ruling — see the block in runBookingFlow); ⚠-prefixed keys
   * and every client-event answer stay private per the 24 Aug ruling.
   */
  inviteDetails?: Array<{ label: string; value: string | null | undefined }>;
  bookedByLabel: string;        // for the calendar event description
  /** The prospect's company: the callback's calendar title names it. */
  companyName?: string | null;
  /** Callbacks: other times (ISO) the prospect could take the call. */
  callbackBackupTimes?: string[];
};

export type BookingFlowResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      booking_id: string;
      starts_at: string;
      meet_link: string | null;
      calendar_created: boolean;
      email_sent: boolean;
      sms_sent: boolean;
      redirect_url: string | null;
    };

export async function runBookingFlow(
  supabase: any, input: BookingFlowInput
): Promise<BookingFlowResult> {
  const { eventType, host } = input;
  const startMs = new Date(input.startsAt).getTime();
  if (!Number.isFinite(startMs) || startMs < Date.now()) {
    return { ok: false, status: 400, error: "That time is in the past" };
  }
  // 16 Oct (the owner): on a client event the phone choice is a 15-minute callback.
  const isCallback = isCallbackBooking(eventType, input.locationChoice);
  const backupTimes = isCallback
    ? [...new Set((input.callbackBackupTimes || [])
        .map((t) => new Date(t))
        .filter((d) => Number.isFinite(d.getTime()))
        .map((d) => d.toISOString()))]
        .filter((t) => t !== new Date(startMs).toISOString())
        .sort()
    : [];
  const durationMinutes = isCallback ? CALLBACK_MINUTES : eventType.duration_minutes;
  let endsAt = new Date(startMs + durationMinutes * 60_000).toISOString();

  // 23 Sep 2026: host-calendar slots (Elena's Trial Day entries). Find the
  // entry this booking joins BEFORE inserting, so the row carries the entry's
  // real end time and shares the slot with the other candidates.
  const joinsHostEntry = !!eventType.host_calendar_slots && !host.client_profile_id && !!host.host_calendar_email;
  let hostEntry: { id: string; endsAt: string; meetLink: string | null } | null = null;
  if (joinsHostEntry) {
    try {
      const t = await getAccessToken(host.host_calendar_email as string);
      if (t) {
        const found = await listHostCalendarEvents(
          t, host.host_calendar_email as string,
          new Date(startMs - 60_000).toISOString(), new Date(startMs + 60_000).toISOString(),
          eventType.host_calendar_slots as string,
        );
        const hit = found.find((ev) => Math.abs(new Date(ev.startsAt).getTime() - startMs) < 60_000);
        if (hit) { hostEntry = { id: hit.id, endsAt: hit.endsAt, meetLink: hit.meetLink }; endsAt = hit.endsAt; }
      }
    } catch (e) {
      console.error("[booking-flow] host entry lookup:", e);
    }
    if (!hostEntry) {
      return { ok: false, status: 409, error: "That slot is no longer on the host's calendar — pick another time" };
    }
  }

  // One canonical number from here on: the stored row, the calendar note,
  // the confirmation SMS and the queued reminder recipients all agree.
  const prospectMobile = normalizeMobile(input.prospectMobile);

  const { data: booking, error: insErr } = await supabase
    .from("bookings")
    .insert({
      event_type_id: eventType.id,
      host_user_id: host.host_user_id || null,
      client_profile_id: host.client_profile_id || null,
      meeting_id: input.meetingId || null,
      rebooked_from_id: input.rebookedFromId || null,
      starts_at: new Date(startMs).toISOString(),
      ends_at: endsAt,
      status: "confirmed",
      source: input.source,
      prospect_name: input.prospectName || null,
      prospect_email: input.prospectEmail || null,
      prospect_mobile: prospectMobile,
      answers: input.answers || {},
      location_choice: input.locationChoice || null,
      prospect_timezone: input.prospectTimezone || null,
      created_by: input.createdBy || null,
      shared_slot: joinsHostEntry,
      ...(backupTimes.length > 0 ? { callback_backup_times: backupTimes } : {}),
    })
    .select()
    .single();
  if (insErr) {
    if (insErr.code === "23P01") {
      return { ok: false, status: 409, error: "That slot has just been taken — pick another time" };
    }
    console.error("[booking-flow] insert:", insErr);
    return { ok: false, status: 500, error: insErr.message };
  }

  // 15 Oct 2026 (the owner): a lead who filled in Enquire and then booked shows
  // "Meeting booked" in Marketing Leads. Matched on email; never fatal, and
  // a user-scoped client simply updates nothing (RLS).
  if (booking.prospect_email) {
    try {
      const needle = String(booking.prospect_email).replace(/[%_\\]/g, (c: string) => "\\" + c);
      await supabase
        .from("marketing_leads")
        .update({ outcome: "meeting_booked" })
        .ilike("email", needle)
        .or("outcome.is.null,outcome.neq.meeting_booked");
    } catch (e) {
      console.error("[booking-flow] lead mark:", e);
    }
  }

  let hostName = host.client_name || "your host";
  if (host.host_user_id) {
    const { data: hostProfile } = await supabase
      .from("profiles").select("full_name").eq("id", host.host_user_id).maybeSingle();
    hostName = hostProfile?.full_name || hostName;
  }
  const prospectName = (input.prospectName || "").trim();
  const local = utcToZonedParts(booking.starts_at, BUSINESS_TZ);

  // Google Calendar event → Google emails the official invite to the prospect.
  // Phone events (e.g. Live Call Trials) get a plain calendar entry — no Meet,
  // and a client discovery call can be booked as a phone call one-off.
  const isPhoneEvent =
    eventType.location_type === "phone" || input.locationChoice === "phone";
  // Google can only mint Google Meet conferences. Clients who run Teams or
  // Zoom carry their own standing room link, which travels in the invite
  // instead; without one we fall back to Meet so the booking still works.
  const provider = eventType.location_type as string | null;
  const staticLink =
    !isPhoneEvent && (provider === "teams" || provider === "zoom")
      ? (eventType.static_meeting_link as string | null) || null
      : null;
  if (!isPhoneEvent && (provider === "teams" || provider === "zoom") && !staticLink) {
    console.warn(
      `[booking-flow] event ${eventType.id} is ${provider} but has no static_meeting_link — falling back to Google Meet`,
    );
  }
  const providerLabel = provider === "teams" ? "Microsoft Teams" : "Zoom";
  let calendarCreated = false;
  let meetLink: string | null = null;
  try {
    // Which calendar hosts the event:
    //  - staff host → their own company calendar via the Workspace service acct;
    //  - client host, connected (Tier 2) → the client's own calendar via their
    //    OAuth — Google (Meet minted) or Microsoft (one-time Teams link minted);
    //  - client host, not connected (Tier 1) → the Meridian bookings calendar,
    //    with the client added as an attendee so they get the invite by email.
    let token: string | null = null;
    let calendarEmail: string | null = null;
    let clientProvider: "google" | "microsoft" | null = null;
    const extraAttendees = [...(host.extra_attendees || [])];
    if (host.client_profile_id) {
      const access = await getClientCalendarAccess(supabase, host.client_profile_id);
      if (access) {
        token = access.token;
        calendarEmail = access.calendarEmail;
        clientProvider = access.provider;
      } else {
        calendarEmail = VEXON_BOOKINGS_CALENDAR();
        token = await getAccessToken(calendarEmail);
        if (host.client_email) extraAttendees.push(host.client_email);
      }
    } else if (host.host_calendar_email) {
      calendarEmail = host.host_calendar_email;
      token = await getAccessToken(calendarEmail);
    }
    if (token && calendarEmail) {
      // The event description is visible to EVERY attendee — one description
      // per event, no per-person view. Since 1 Sep (Marcus's ruling,
      // confirmed by the owner) STAFF events — acquisition discovery calls and
      // the TA's live call trials — carry the screening/qualification Q&A so
      // the host reads it right in the calendar popup, invitee included.
      // Two lines that still hold from the 24 Aug privacy ruling:
      //   · CLIENT events stay clean — fulfilment answers never render;
      //   · ⚠-prefixed answer keys are internal annotations (push-through
      //     and disqualify reasons) the prospect must never read.
      const detailLines = (input.inviteDetails || [])
        .filter((d) => d && d.value && String(d.value).trim())
        .map((d) => `${d.label}: ${String(d.value).trim()}`);
      const detailBlock = detailLines.length > 0 ? `${detailLines.join("\n")}\n\n` : "";
      const answerEntries =
        !eventType.client_id && !host.client_profile_id
          ? Object.entries(input.answers || {}).filter(
              ([k, v]) => !k.startsWith("⚠") && v != null && String(v).trim() !== ""
            )
          : [];
      const answersBlock =
        answerEntries.length > 0
          ? `Screening answers:\n${answerEntries
              .map(([k, v]) => `• ${k}: ${String(v).trim()}`)
              .join("\n")}\n\n`
          : "";
      const who = input.prospectName || input.prospectEmail || "Prospect";
      // A callback (16 Oct, the owner): one event on the client's calendar and the
      // prospect's, titled for both, no link, Busy. The backup times are on it
      // so the client knows when else to try.
      const phoneNote = isCallback
        ? callbackNote(host.client_name, who, prospectMobile, backupTimes)
        : prospectMobile
        ? `PHONE CALL — ${host.client_name || "we"} will call ${prospectMobile}.\n\n`
        : "PHONE CALL — no video link.\n\n";
      const summary = isCallback
        ? `Callback: ${host.client_name || "Callback"} × ${(input.companyName || "").trim() || who}`
        : `${eventType.name} — ${who}`;
      // 11 Sep (Marcus, 8 Sep): a client's invite must not say who booked it
      // or that it came through Vexon OS — it is the client's own meeting, from
      // the client's own calendar. Internal (staff-hosted) events keep the
      // attribution line, which is useful in the AE's diary.
      const attribution = eventType.client_id || host.client_profile_id
        ? ""
        : `Booked via Vexon OS Bookings (${input.bookedByLabel}).`;

      if (hostEntry) {
        // Join the host's existing entry as a guest: her Meet link, her
        // time, alongside whoever else is booked that day. Google emails
        // the invite to the new guest only.
        const joined = await addHostCalendarGuests(token, calendarEmail, hostEntry.id, [
          ...(input.prospectEmail ? [input.prospectEmail] : []),
          ...extraAttendees,
        ]);
        calendarCreated = true;
        meetLink = joined.meetLink || hostEntry.meetLink;
        await supabase.from("bookings")
          .update({ google_event_id: hostEntry.id, google_meet_link: meetLink })
          .eq("id", booking.id);
      } else if (clientProvider === "microsoft") {
        // Microsoft-connected client: the event goes on their own Outlook
        // calendar and Teams mints a unique join link for this booking —
        // Calendly parity, no standing room URL needed. A static link, if one
        // is configured, is ignored in favour of the minted one.
        const ev = await createMsCalendarEvent(token, {
          summary,
          description:
            (isPhoneEvent ? phoneNote : "") +
            detailBlock +
            answersBlock +
            attribution,
          startsAt: booking.starts_at,
          endsAt: booking.ends_at,
          attendeeEmails: [
            ...(input.prospectEmail ? [input.prospectEmail] : []),
            ...extraAttendees,
          ],
          includeTeams: !isPhoneEvent,
          location: isPhoneEvent
            ? (prospectMobile ? `Phone: ${prospectMobile}` : "Phone call")
            : null,
        });
        calendarCreated = true;
        meetLink = isPhoneEvent ? null : ev.joinUrl;
        await supabase.from("bookings")
          .update({ google_event_id: ev.eventId, google_meet_link: meetLink })
          .eq("id", booking.id);
      } else {
        const ev = await createCalendarEvent(token, calendarEmail, {
          summary,
          description:
            (isPhoneEvent ? phoneNote : "") +
            (staticLink ? `Join on ${providerLabel}: ${staticLink}\n\n` : "") +
            detailBlock +
            answersBlock +
            attribution,
          startsAt: booking.starts_at,
          endsAt: booking.ends_at,
          attendeeEmail: input.prospectEmail || null,
          attendeeEmails: extraAttendees,
          requestId: booking.id,
          includeMeet: !isPhoneEvent && !staticLink,
          location: isPhoneEvent
            ? (prospectMobile ? `Phone: ${prospectMobile}` : "Phone call")
            : staticLink,
        });
        calendarCreated = true;
        // google_meet_link doubles as the generic join-link column — reminders
        // and the meetings sync read it whatever the provider.
        meetLink = isPhoneEvent ? null : (staticLink || ev.meetLink);
        await supabase.from("bookings")
          .update({ google_event_id: ev.eventId, google_meet_link: meetLink })
          .eq("id", booking.id);
      }
    }
  } catch (e) {
    // The booking stands; a calendar failure is reported, not fatal.
    console.error("[booking-flow] calendar:", e);
  }

  // Keep the meetings row (and every dashboard reading it) in sync.
  if (input.meetingId) {
    await supabase.from("meetings")
      .update({
        meeting_date: local.date,
        meeting_time: local.time,
        ...(meetLink ? { google_meet_link: meetLink } : {}),
      })
      .eq("id", input.meetingId);
  }

  // Confirmation SMS now (the Google invite is the email confirmation);
  // reminder rows for the cron.
  const emailSent = false;
  let smsSent = false;
  // 16 Oct (the owner): the wording comes from Dev Centre > Kronos > Message copy.
  const templates = await loadTemplates(supabase, eventType.id);
  // A callback gets its own text (the owner: "your callback with Brightwater is booked for …").
  const confirmTemplate = isCallback ? templates.callback_sms : templates.confirmation_sms;
  if (prospectMobile && confirmTemplate.enabled) {
    const r = await sendTwilioSms(
      prospectMobile,
      // 2 Oct (Tom): "with Meridian", not "with <host>"; plain "A calendar invite has been sent".
      // 8 Oct (the owner): a client's prospect is booking with that client, so client events name the client.
      renderSms(confirmTemplate, templateVars({
        prospectName, eventName: eventType.name,
        withName: (eventType.client_id && host.client_name) || "Meridian",
        startsAt: booking.starts_at, meetLink, prospectMobile, callback: isCallback,
      })),
    );
    smsSent = r.ok;
    if (r.attempted) {
      await supabase.from("booking_notifications").insert({
        booking_id: booking.id, channel: "sms", template: isCallback ? "callback" : "confirmation",
        recipient: prospectMobile, scheduled_for: new Date().toISOString(),
        sent_at: r.ok ? new Date().toISOString() : null,
        status: r.ok ? "sent" : "failed", error: r.error,
      });
    }
  }

  // Reminders: 24h and 3h before (Marcus, 6 Oct: every booking gets a text at
  // booking, then email and text a day before and 3 hours before), whichever
  // still lie in the future. A callback booked for today gets none (the owner,
  // 16 Oct): the booking text has just told them.
  const reminderRows = [];
  const skipReminders = isCallback && londonDate(startMs) === londonDate(Date.now());
  for (const [template, offsetMs] of (skipReminders ? [] : [
    ["reminder_24h", 24 * 3600_000],
    ["reminder_3h", 3 * 3600_000],
  ] as const)) {
    const due = new Date(startMs - offsetMs);
    if (due.getTime() <= Date.now()) continue;
    if (input.prospectEmail) {
      reminderRows.push({
        booking_id: booking.id, channel: "email", template,
        recipient: input.prospectEmail, scheduled_for: due.toISOString(), status: "pending",
      });
    }
    if (prospectMobile) {
      reminderRows.push({
        booking_id: booking.id, channel: "sms", template,
        recipient: prospectMobile, scheduled_for: due.toISOString(), status: "pending",
      });
    }
  }
  if (reminderRows.length > 0) {
    await supabase.from("booking_notifications").insert(reminderRows);
  }

  // 18 Sep (Marcus, Zapier cancelled): the hooks that used to hang off a
  // Zapier catch-webhook — which never fired, because nothing here ever
  // posted to it. Per event: add the prospect to a Kit (ConvertKit)
  // sequence, and/or POST the booking to a webhook URL (n8n, anything).
  // Fire-and-forget: a slow or broken hook must never fail the booking.
  const kitPromise = addToKitSequence(eventType, input);
  const hookPromise = postBookingWebhook(eventType, input, booking, meetLink);
  await Promise.allSettled([kitPromise, hookPromise]);

  return {
    ok: true,
    booking_id: booking.id,
    starts_at: booking.starts_at,
    meet_link: meetLink,
    calendar_created: calendarCreated,
    email_sent: emailSent,
    sms_sent: smsSent,
    redirect_url: eventType.redirect_url || null,
  };
}


/** Kit (ConvertKit) v4: create/refresh the subscriber, then add to the sequence. */
async function addToKitSequence(eventType: any, input: BookingFlowInput): Promise<void> {
  const sequenceId = String(eventType?.kit_sequence_id || "").trim();
  const apiKey = Deno.env.get("KIT_API_KEY");
  const email = (input.prospectEmail || "").trim();
  if (!sequenceId || !apiKey || !email) return;
  // 20 Sep (the owner): Kit adds are behind a switch in Dev Centre → Integrations.
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: sys } = await svc.from("system_settings").select("kit_sequences_enabled").limit(1).maybeSingle();
  if (sys?.kit_sequences_enabled !== true) { console.log("[KIT] switched off in Dev Centre, skipped"); return; }
  try {
    const headers = { "Content-Type": "application/json", "X-Kit-Api-Key": apiKey };
    const firstName = (input.prospectName || "").trim().split(/\s+/)[0] || undefined;
    const sub = await fetch("https://api.kit.com/v4/subscribers", {
      method: "POST", headers,
      body: JSON.stringify({ email_address: email, first_name: firstName, state: "active" }),
    });
    if (!sub.ok && sub.status !== 409) {
      console.error("[KIT] subscriber upsert failed", sub.status, await sub.text());
      return;
    }
    const seq = await fetch(`https://api.kit.com/v4/sequences/${encodeURIComponent(sequenceId)}/subscribers`, {
      method: "POST", headers, body: JSON.stringify({ email_address: email }),
    });
    if (!seq.ok) console.error("[KIT] add to sequence failed", seq.status, await seq.text());
    else console.log(`[KIT] ${email} added to sequence ${sequenceId} (event ${eventType.slug})`);
  } catch (e) {
    console.error("[KIT] error", e);
  }
}

/** Per-event outbound webhook: one JSON POST per confirmed booking. */
async function postBookingWebhook(eventType: any, input: BookingFlowInput, booking: any, meetLink: string | null): Promise<void> {
  const url = String(eventType?.webhook_url || "").trim();
  if (!/^https:\/\//.test(url)) return;
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "booking.confirmed",
        booking_id: booking.id,
        event_slug: eventType.slug,
        event_name: eventType.name,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
        source: input.source,
        prospect: { name: input.prospectName || null, email: input.prospectEmail || null, mobile: input.prospectMobile || null },
        answers: input.answers || {},
        meet_link: meetLink,
      }),
    });
    if (!res.ok) console.error("[WEBHOOK] booking webhook failed", res.status, url);
  } catch (e) {
    console.error("[WEBHOOK] error", e);
  }
}

/** Move appointment (12 Oct 2026, the owner: a rebook updates the existing
 * meeting instead of creating a twin). The booking row moves, the calendar
 * event is patched in place (same Meet link; the provider emails the new
 * time), the meetings row follows, pending reminders are voided and
 * re-queued, and the prospect gets a "moved" SMS and email. The caller has
 * already checked the slot is free (booking-reschedule, with the booking's
 * own slot ignored). */
export type RescheduleResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      booking_id: string;
      starts_at: string;
      ends_at: string;
      previous_starts_at: string;
      meet_link: string | null;
      calendar_updated: boolean;
      sms_sent: boolean;
      email_sent: boolean;
    };

export async function rescheduleBooking(
  supabase: any,
  booking: {
    id: string; event_type_id: string; host_user_id: string | null; client_profile_id: string | null;
    google_event_id: string | null; google_meet_link: string | null; starts_at: string; ends_at: string;
    meeting_id: string | null; prospect_name: string | null; prospect_email: string | null;
    prospect_mobile: string | null; shared_slot: boolean | null;
    location_choice?: string | null; callback_backup_times?: string[] | null;
  },
  eventType: { id: string; name: string; duration_minutes: number; client_id?: string | null },
  newStartsAt: string,
): Promise<RescheduleResult> {
  const startMs = new Date(newStartsAt).getTime();
  if (!Number.isFinite(startMs) || startMs < Date.now()) return { ok: false, status: 400, error: "That time is in the past" };
  const previousStartsAt = new Date(booking.starts_at).toISOString();
  const startsAt = new Date(startMs).toISOString();
  if (startsAt === previousStartsAt) return { ok: false, status: 400, error: "That is the time it is already booked for" };
  if (booking.shared_slot) return { ok: false, status: 409, error: "This booking sits on a shared calendar slot and cannot be moved here. Cancel it and book the new slot." };
  // 16 Oct: a callback stays a 15-minute callback when it moves.
  const isCallback = isCallbackBooking(eventType, booking.location_choice);
  const endsAt = new Date(startMs + (isCallback ? CALLBACK_MINUTES : eventType.duration_minutes) * 60_000).toISOString();
  const now = new Date().toISOString();
  // Moving a callback onto one of its backup times uses that time up, and
  // backups already past are dropped.
  const backupsLeft = (booking.callback_backup_times || [])
    .map((t) => new Date(t).toISOString())
    .filter((t) => t !== startsAt && new Date(t).getTime() > Date.now())
    .sort();

  const { data: moved, error: updErr } = await supabase
    .from("bookings")
    .update({
      starts_at: startsAt, ends_at: endsAt, rescheduled_from: previousStartsAt, rescheduled_at: now, updated_at: now,
      ...(isCallback && booking.callback_backup_times ? { callback_backup_times: backupsLeft.length > 0 ? backupsLeft : null } : {}),
    })
    .eq("id", booking.id)
    .in("status", ["held", "confirmed"])
    .select("id, google_event_id, google_meet_link, prospect_name, prospect_email, prospect_mobile")
    .maybeSingle();
  if (updErr) {
    if (updErr.code === "23P01") return { ok: false, status: 409, error: "That slot has just been taken, pick another time" };
    console.error("[booking-flow] reschedule update:", updErr);
    return { ok: false, status: 500, error: updErr.message };
  }
  if (!moved) return { ok: false, status: 404, error: "No active booking found to move" };

  let client: { company_name: string; logo: string | null; email: string | null } | null = null;
  if (eventType.client_id) {
    const { data } = await supabase.from("client_profiles")
      .select("company_name, logo, email").eq("id", eventType.client_id).maybeSingle();
    client = data || null;
  }
  // A moved callback's invite gets its backup line rewritten to what is left.
  const newDescription = isCallback
    ? callbackNote(
        client?.company_name, moved.prospect_name || moved.prospect_email || "Prospect",
        normalizeMobile(moved.prospect_mobile), backupsLeft,
      )
    : undefined;

  // Calendar: the same targets cancelBooking tries (client calendar, Google
  // or Microsoft, plus the Meridian bookings calendar; or the staff host).
  let calendarUpdated = false;
  let meetLink: string | null = moved.google_meet_link ?? null;
  if (moved.google_event_id) {
    const targets: Array<{ token: string; email: string; provider: "google" | "microsoft" }> = [];
    if (booking.client_profile_id) {
      const access = await getClientCalendarAccess(supabase, booking.client_profile_id);
      if (access) targets.push({ token: access.token, email: access.calendarEmail, provider: access.provider });
      const vexonEmail = VEXON_BOOKINGS_CALENDAR();
      try {
        const tk = await getAccessToken(vexonEmail);
        if (tk) targets.push({ token: tk, email: vexonEmail, provider: "google" });
      } catch (e) { console.error("[booking-flow] vexon calendar token:", e); }
    } else {
      const { data: host } = await supabase
        .from("booking_event_hosts").select("host_calendar_email")
        .eq("event_type_id", booking.event_type_id).eq("host_user_id", booking.host_user_id).maybeSingle();
      if (host?.host_calendar_email) {
        try {
          const tk = await getAccessToken(host.host_calendar_email);
          if (tk) targets.push({ token: tk, email: host.host_calendar_email, provider: "google" });
        } catch (e) { console.error("[booking-flow] host calendar token:", e); }
      }
    }
    for (const target of targets) {
      try {
        if (target.provider === "microsoft") {
          if (await moveMsCalendarEvent(target.token, moved.google_event_id, startsAt, endsAt, newDescription)) calendarUpdated = true;
        } else {
          const ev = await moveCalendarEvent(target.token, target.email, moved.google_event_id, startsAt, endsAt, newDescription);
          if (ev) {
            calendarUpdated = true;
            if (ev.meetLink && ev.meetLink !== meetLink) {
              meetLink = ev.meetLink;
              await supabase.from("bookings").update({ google_meet_link: meetLink }).eq("id", moved.id);
            }
          }
        }
      } catch (e) {
        console.error("[booking-flow] reschedule calendar:", e);
      }
    }
  }

  // The meetings row follows, in London time, keeping where it came from.
  if (booking.meeting_id) {
    const local = utcToZonedParts(startsAt, BUSINESS_TZ);
    const { error } = await supabase.from("meetings")
      .update({ meeting_date: local.date, meeting_time: local.time, moved_from: previousStartsAt, ...(meetLink ? { google_meet_link: meetLink } : {}) })
      .eq("id", booking.meeting_id);
    if (error) console.error("[booking-flow] reschedule meetings row:", error);
  }

  // Reminders: void the pending ones, queue fresh 24h and 3h ones.
  await supabase.from("booking_notifications")
    .update({ status: "cancelled", error: `moved to ${startsAt}` })
    .eq("booking_id", moved.id).eq("status", "pending");
  const prospectMobile = normalizeMobile(moved.prospect_mobile);
  const prospectEmail: string | null = moved.prospect_email || null;
  const reminderRows: any[] = [];
  // A callback moved to today gets no reminders, the same as one booked for today.
  const skipReminders = isCallback && londonDate(startMs) === londonDate(Date.now());
  for (const [template, offsetMs] of (skipReminders ? [] : [["reminder_24h", 24 * 3600_000], ["reminder_3h", 3 * 3600_000]] as const)) {
    const due = new Date(startMs - offsetMs);
    if (due.getTime() <= Date.now()) continue;
    if (prospectEmail) reminderRows.push({ booking_id: moved.id, channel: "email", template, recipient: prospectEmail, scheduled_for: due.toISOString(), status: "pending" });
    if (prospectMobile) reminderRows.push({ booking_id: moved.id, channel: "sms", template, recipient: prospectMobile, scheduled_for: due.toISOString(), status: "pending" });
  }
  if (reminderRows.length > 0) await supabase.from("booking_notifications").insert(reminderRows);

  // Tell the prospect. Google or Microsoft already emailed the calendar
  // update; this is the plain-English note in our own voice. 16 Oct (the owner):
  // the wording comes from Dev Centre > Kronos > Message copy, and a client's
  // prospect hears the client's name and replies to the client, the same as
  // the reminders.
  const templates = await loadTemplates(supabase, eventType.id);
  const vars = templateVars({
    prospectName: moved.prospect_name, eventName: eventType.name,
    withName: client?.company_name || "Meridian",
    startsAt, wasStartsAt: previousStartsAt, meetLink, prospectMobile, callback: isCallback,
  });
  const record = async (channel: "sms" | "email", recipient: string, r: { attempted: boolean; ok: boolean; error: string | null }) => {
    await supabase.from("booking_notifications").insert({
      booking_id: moved.id, channel, template: "rescheduled", recipient,
      scheduled_for: now, sent_at: r.ok ? new Date().toISOString() : null,
      status: r.ok ? "sent" : r.attempted ? "failed" : "pending",
      error: r.attempted ? r.error : "provider not configured yet",
    });
  };
  let smsSent = false;
  if (prospectMobile && templates.rescheduled_sms.enabled) {
    const r = await sendTwilioSms(prospectMobile, renderSms(templates.rescheduled_sms, vars));
    smsSent = r.ok;
    await record("sms", prospectMobile, r);
  }
  let emailSent = false;
  if (prospectEmail && templates.rescheduled_email.enabled) {
    const mail = renderEmail(templates.rescheduled_email, vars, {
      meetLink, brandName: client?.company_name || null, clientLogo: client?.logo || null, callback: isCallback,
    });
    const r = await sendResendEmail(
      prospectEmail, mail.subject, mail.html, undefined,
      client ? { from: clientFromAddress(client.company_name), replyTo: client.email || undefined } : undefined,
    );
    emailSent = r.ok;
    await record("email", prospectEmail, r);
  }

  return { ok: true, booking_id: moved.id, starts_at: startsAt, ends_at: endsAt, previous_starts_at: previousStartsAt, meet_link: meetLink, calendar_updated: calendarUpdated, sms_sent: smsSent, email_sent: emailSent };
}
