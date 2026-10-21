// Public API for the /bookings/<slug> page. verify_jwt = false in config.toml —
// anyone with the link can read an active event's public info + availability
// and book a slot. Marcus's staff-booking redesign (2026-08-20) adds:
//   · round robin  — availability merged across hosts, host assigned at booking
//   · close_lead   — staff-only Close CRM lookup to autofill the prospect
//                     (trialists read the separate trial org, TRIALIST_API_KEY)
//   · auto-log     — when a signed-in staff member books a staff_mode event,
//                    the dashboard meeting is created automatically
// Anonymous visitors still book normally (ads flow) — they just don't get the
// staff extras. Host emails never leave the server; requested slots are
// re-validated server-side; honeypot swallows dumb bots; the DB exclusion
// constraint guards the final race.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { computeSlots } from "../_shared/slot-engine.ts";
import { runBookingFlow, sendResendEmail } from "../_shared/booking-flow.ts";
import { utcToZonedParts } from "../_shared/google-calendar.ts";
import {
  CALLBACK_MAX_BACKUPS, CALLBACK_MINUTES, backupLabel, callbackDays, callbackNoticeMinutes, isCallbackBooking,
} from "../_shared/callback.ts";

/** Callback slots for a client event (16 Oct 2026): 15 minutes, today and the
 * next two working days in UK time, the event's callback notice. */
const callbackSlotOpts = (eventType: { callback_notice_minutes?: number | null }) => ({
  callback: { dayKeys: callbackDays(), noticeMinutes: callbackNoticeMinutes(eventType) },
});

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max).trim() : "";

// Consumer email providers — used by the staff-mode personal-email guard
// (Marcus, 21 Aug: setters must double-check or push through with a reason).
// Keep in sync with PERSONAL_EMAIL_DOMAINS in src/pages/public/BookingPage.tsx.
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.co.uk",
  "outlook.com", "outlook.co.uk", "live.com", "live.co.uk", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "protonmail.com", "proton.me", "gmx.com", "gmx.co.uk",
  "mail.com", "btinternet.com", "sky.com", "talktalk.net", "virginmedia.com",
]);

async function loadEvent(supabase: any, slug: string) {
  const { data } = await supabase
    .from("booking_event_types")
    .select("*, booking_event_hosts(host_user_id, host_calendar_email, priority, client_profile_id, external_email, external_name)")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data || null;
}

function sortedHosts(eventType: any) {
  return [...(eventType.booking_event_hosts || [])].sort(
    (a: any, b: any) => (a.priority || 99) - (b.priority || 99)
  );
}

/** Slot-engine host reference for a booking_event_hosts row (staff or client). */
function hostRefOf(h: any) {
  return h.client_profile_id
    ? { clientProfileId: h.client_profile_id as string }
    : { hostUserId: h.host_user_id as string, calendarEmail: h.host_calendar_email as string };
}

const STAFF_ADMIN_TIER = ["dev", "admin", "ops", "sdr_manager", "csm"];

/** Trial day (16 Oct 2026): who reviews and books trialist leads. */
type Db = ReturnType<typeof createClient>;
// Event rows are untyped here, as everywhere in this file (see loadEvent).
type EventRow = Parameters<typeof computeSlots>[1] & Record<string, unknown> & {
  client_id?: string | null; offer_phone_choice?: boolean | null; callback_notice_minutes?: number | null;
  duration_minutes: number; accepting_bookings?: boolean | null;
};
type HostRow = { client_profile_id?: string | null; external_name?: string | null; external_email?: string | null; host_user_id?: string | null; host_calendar_email?: string | null };
const TRIAL_REVIEWER_ROLES = ["dev", "admin", "ops", "csm", "hr", "sdr_manager"];

/** A client's live booking event and its client host, for the trial day. */
async function trialClientEvent(supabase: Db, clientId: string): Promise<{ ev: EventRow; host: HostRow } | null> {
  const { data: ev } = await supabase
    .from("booking_event_types")
    .select("*, booking_event_hosts(host_user_id, host_calendar_email, priority, client_profile_id, external_email, external_name)")
    .eq("client_id", clientId).eq("is_active", true)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!ev || ev.accepting_bookings === false) return null;
  const host = sortedHosts(ev).find((h: HostRow) => h.client_profile_id) as HostRow | undefined;
  return host ? { ev: ev as EventRow, host } : null;
}

/** Mirrors trial_active_clients(): the live, non-test clients ticked on the
 * trialist's candidate card, or every live client when none of those is. */
async function trialistRepresents(supabase: Db, userId: string, clientId: string): Promise<boolean> {
  const { data: cand } = await supabase
    .from("candidates").select("trial_client_ids")
    .eq("trialist_user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const { data: live } = await supabase
    .from("client_profiles").select("id").eq("status", "active").eq("is_test_account", false);
  const liveIds = new Set<string>((live || []).map((c: { id: string }) => c.id));
  const picked = ((cand?.trial_client_ids || []) as string[]).filter((id) => liveIds.has(id));
  return picked.length > 0 ? picked.includes(clientId) : liveIds.has(clientId);
}

/** Free times for the trial day, the one rule for the trialist's window and
 * for booking a lead: a callback only where the client takes them. */
async function trialSlotsFor(supabase: Db, found: { ev: EventRow; host: HostRow }, choice: "video" | "phone") {
  const locationChoice: "video" | "phone" | null = found.ev.offer_phone_choice ? choice : null;
  const callback = isCallbackBooking(found.ev, locationChoice);
  const res = await computeSlots(supabase, found.ev, hostRefOf(found.host), callback ? callbackSlotOpts(found.ev) : { days: horizonDays(found.ev) });
  return { ...res, callback, locationChoice };
}

/** Resolves the signed-in staff member from the Authorization header, if any.
 * Anonymous visitors carry only the anon key → null. */
async function staffUser(supabase: any, req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await anonClient.auth.getUser();
  if (!user) return null;
  const { data: roleRows } = await supabase
    .from("user_roles").select("role").eq("user_id", user.id);
  // A client-portal login holds role 'client' — that is NOT staff. Without this
  // filter a signed-in client passes every staff gate (Close lookup, auto-log).
  const roles = (roleRows ?? []).map((r: any) => r.role as string).filter((r: string) => r !== "client");
  return roles.length > 0 ? { id: user.id, email: user.email, roles } : null;
}

/** Maps the canonical qualification answers onto the meetings columns.
 * Matched by question label so the Dev Center question builder stays free-form
 * for other events. */
function qualColumns(answers: Record<string, unknown>) {
  const byLabel = (needle: string) => {
    const hit = Object.entries(answers).find(([k]) =>
      k.toLowerCase().includes(needle));
    return hit ? String(hit[1]) : null;
  };
  const yn = (v: string | null) => (v == null ? null : /^yes$/i.test(v));
  return {
    revenue_last_12_months: byLabel("revenue"),
    // Asked until 22 Sep 2026 and kept so older events still map.
    sector_over_1000_companies: yn(byLabel("1,000")),
    only_decision_maker: yn(byLabel("decision maker")),
    start_timeline: byLabel("how soon"),
    // 22 Sep 2026 (Marcus): capacity is the knock-out, the rest is context.
    capacity_5_10: yn(byLabel("workable vacancies")),
    agency_led: byLabel("one industry"),
    vacancies_from_new_clients_last_month: byLabel("how many vacancies"),
    bd_bottleneck: byLabel("bottleneck"),
    target_job_titles: byLabel("job titles"),
  };
}

/** Marcus's fulfilment qualification tree (21 Aug), validated server-side so
 * the page can't be bypassed. Returns clean values for the meetings columns. */
type FulfilQuals = {
  hiring: boolean;
  roles: Array<{ title: string; salary: number | null; currency: string }>;
  job_spec: boolean | null;
  open_to_cvs: boolean | null;
  cv_titles: string;
  cv_level: string;
  dm_present: boolean;
  dm_status: string | null;
  dm_email: string;
  disqualify_reason: string;
};

function parseFulfilmentQuals(raw: any, opts: { prospect?: boolean } = {}):
  | { ok: true; q: FulfilQuals }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Qualification answers are required" };
  }
  const hiring = raw.hiring === true;
  const openToCvs = raw.open_to_cvs === true ? true : raw.open_to_cvs === false ? false : null;
  const roles = Array.isArray(raw.roles)
    ? raw.roles.slice(0, 12).map((r: any) => ({
        title: clip(r?.title, 120),
        salary: r?.salary != null && r?.salary !== "" && Number.isFinite(Number(r.salary))
          ? Number(r.salary) : null,
        currency: ["GBP", "USD", "EUR", "ZAR"].includes(r?.currency) ? r.currency : "GBP",
      })).filter((r: any) => r.title)
    : [];
  const jobSpec = raw.job_spec === true ? true : raw.job_spec === false ? false : null;
  const cvTitles = clip(raw.cv_titles, 500);
  const cvLevel = clip(raw.cv_level, 200);
  const dmPresent = raw.dm_present === true;
  const dmStatus = ["joining", "briefed_by_prospect", "email_pending"].includes(raw.dm_status)
    ? raw.dm_status : null;
  const dmEmail = clip(raw.dm_email, 200);
  // A prospect booking themselves is never blocked for not qualifying; the
  // meeting just carries the flag so the setter and client can see it.
  const disqualifyReason = opts.prospect
    ? (!hiring && openToCvs === false ? "Self-booked: not hiring and not open to CVs" : "")
    : clip(raw.disqualify_reason, 500);

  if (hiring) {
    if (roles.length === 0) return { ok: false, error: "Add at least one role they're hiring for" };
    if (jobSpec === null) return { ok: false, error: "Answer the job-spec question" };
  } else {
    if (openToCvs === null) return { ok: false, error: "Answer whether they're open to receiving CVs" };
    if (openToCvs) {
      if (!cvTitles) return { ok: false, error: "What kind of candidates would they want to see?" };
      if (!cvLevel) return { ok: false, error: "What level are those candidates?" };
    } else if (!disqualifyReason) {
      return { ok: false, error: "Not qualified — not hiring and not open to CVs. Add a reason to book it anyway" };
    }
  }
  if (dmPresent) {
    if (!dmStatus) return { ok: false, error: "Say how the other decision maker is involved" };
    if (dmStatus === "joining" && !EMAIL_RE.test(dmEmail)) {
      return { ok: false, error: "Add the decision maker's email — they're joining the meeting" };
    }
  }
  return {
    ok: true,
    q: {
      hiring, roles, job_spec: jobSpec, open_to_cvs: hiring ? null : openToCvs,
      cv_titles: cvTitles, cv_level: cvLevel,
      dm_present: dmPresent, dm_status: dmPresent ? dmStatus : null, dm_email: dmEmail,
      disqualify_reason: disqualifyReason,
    },
  };
}

/** Marcus's acquisition qualification tree (25 Aug): the four canonical
 * questions plus conditional follow-ups, validated server-side like the
 * fulfilment tree. Option values must match the setter Log Meeting form. */
const REVENUE_BANDS = [
  "Under £300,000",
  "£300,000-£1 million",
  "£1 million-£5 million",
  "£5 million-£10 million",
  "£10 million+",
];
// Kept for older payloads; the start-timeline question stopped being asked 22 Sep 2026.
const START_TIMELINES = ["Immediately", "Within a month", "In more than a month"];
const ACQ_DM_STATUSES = ["joining", "attending_instead", "briefed_by_prospect", "email_pending"];

type AcqQuals = {
  revenue_band: string;
  price_qualified: boolean | null;
  price_qualified_reason: string;
  tam_over_1000: boolean;
  tam_reason: string;
  only_dm: boolean;
  dm_name: string;
  dm_status: string | null;
  dm_email: string;
  start_timeline: string;
  start_timeline_reason: string;
  capacity_5_10: boolean;
  // 22 Sep 2026 (Marcus): replaces the TAM and start-timeline gates.
  agency_led: string;
  vacancies_last_month: string;
  bd_bottleneck: string;
  target_job_titles: string;
};

/** Industry led = every role in one sector. Candidate led = one role across
 * sectors. Marcus wants the distinction on the record; it disqualifies nobody. */
const AGENCY_LED = [
  "All types of roles within one industry",
  "One type of role across lots of industries",
  "Both",
];

/** 17 Sep: per-event booking horizon in days (NULL = 31, capped at a year). */
function horizonDays(eventType: any): number {
  // 2 Oct (Marcus): client booking pages default to 7 days ahead.
  // 7 Oct (the owner, Daniel's ask for Ridgeway Legal): a client event's own
  // "books up to N days" setting is honoured; 7 applies only when it's unset.
  const fallback = eventType?.client_id ? 7 : 31;
  return Math.min(Math.max(Number(eventType?.booking_horizon_days) || fallback, 1), 365);
}

function parseAcquisitionQuals(raw: any):
  | { ok: true; q: AcqQuals }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Qualification answers are required" };
  }
  const revenueBand = clip(raw.revenue_band, 60);
  if (!REVENUE_BANDS.includes(revenueBand)) {
    return { ok: false, error: "Pick the revenue band" };
  }
  const underBand = revenueBand === "Under £300,000";
  const priceQualified = raw.price_qualified === true ? true
    : raw.price_qualified === false ? false : null;
  const priceReason = clip(raw.price_qualified_reason, 500);
  if (underBand) {
    if (priceQualified === null) {
      return { ok: false, error: "Answer whether they're price qualified" };
    }
    if (!priceReason) {
      return { ok: false, error: "Say roughly what they make / whether they can afford it" };
    }
  }
  // 22 Sep 2026 (Marcus): the 1,000-companies question is no longer asked.
  // Anything still sending it is recorded, but it gates nothing.
  const tamOver = raw.tam_over_1000 === true;
  const tamReason = clip(raw.tam_reason, 500);
  if (raw.only_dm !== true && raw.only_dm !== false) {
    return { ok: false, error: "Answer the decision-maker question" };
  }
  const onlyDm = raw.only_dm === true;
  const dmName = clip(raw.dm_name, 120);
  const dmStatus = ACQ_DM_STATUSES.includes(raw.dm_status) ? raw.dm_status : null;
  const dmEmail = clip(raw.dm_email, 200);
  if (!onlyDm) {
    if (!dmName) return { ok: false, error: "Who else is a decision maker?" };
    if (!dmStatus) return { ok: false, error: "Say how the other decision maker is involved" };
    if ((dmStatus === "joining" || dmStatus === "attending_instead") && !EMAIL_RE.test(dmEmail)) {
      return { ok: false, error: "Add the other decision maker's email — they're attending" };
    }
  }
  // 22 Sep 2026 (Marcus): the start-timeline question is no longer asked.
  const startTimeline = clip(raw.start_timeline, 60);
  const startReason = clip(raw.start_timeline_reason, 500);
  // Validated if sent, never demanded: the booking page enforces it, and this
  // function is deployed before the frontend is published, so a setter mid
  // booking must not be blocked by a question their page has not got yet.
  const agencyLedRaw = clip(raw.agency_led, 80);
  if (agencyLedRaw && !AGENCY_LED.includes(agencyLedRaw)) {
    return { ok: false, error: "Say whether they are industry led or candidate led" };
  }
  const agencyLed = agencyLedRaw;
  // 17 Sep (Marcus): the last question is a hard gate. No capacity for 5–10
  // more vacancies per month = disqualified, no push-through. (Off the back of
  // a prospect who wanted to start but couldn't take one more role.)
  if (raw.capacity_5_10 !== true && raw.capacity_5_10 !== false) {
    return { ok: false, error: "Answer the capacity question" };
  }
  if (raw.capacity_5_10 === false) {
    return { ok: false, error: "This prospect is disqualified based on the criteria — no capacity for an extra 5–10 vacancies per month" };
  }
  return {
    ok: true,
    q: {
      revenue_band: revenueBand,
      price_qualified: underBand ? priceQualified : null,
      price_qualified_reason: underBand ? priceReason : "",
      tam_over_1000: tamOver,
      tam_reason: tamOver ? "" : tamReason,
      only_dm: onlyDm,
      dm_name: onlyDm ? "" : dmName,
      dm_status: onlyDm ? null : dmStatus,
      dm_email: onlyDm ? "" : dmEmail,
      start_timeline: startTimeline,
      start_timeline_reason: startTimeline === "In more than a month" ? startReason : "",
      capacity_5_10: true,
      agency_led: agencyLed,
      // Information gathering only — never a reason to refuse a booking.
      vacancies_last_month: clip(raw.vacancies_last_month, 120),
      bd_bottleneck: clip(raw.bd_bottleneck, 1000),
      target_job_titles: clip(raw.target_job_titles, 500),
    },
  };
}

/**
 * Internal brief for the HOST of an acquisition discovery call.
 *
 * The calendar invite carries one description shared by everyone on it, and
 * the prospect is an attendee — so the qualification answers can never live
 * there (privacy ruling, 24 Aug). This is the other half Marcus asked for
 * (25 Aug): the AE gets the full picture by email, the prospect sees a clean
 * invite. Never sent for client events, where the host IS the client.
 */
function hostBriefHtml(opts: {
  hostName: string;
  eventName: string;
  whenLocal: string;
  prospectName: string;
  prospectEmail: string;
  prospectMobile: string;
  companyName: string;
  companyWebsite: string;
  prospectLinkedin: string;
  closeLeadLink: string;
  bookedBy: string;
  answers: Record<string, unknown>;
}) {
  const row = (label: string, value: string, href?: string) =>
    value
      ? `<tr><td style="padding:6px 12px 6px 0;color:#5f5f66;font-size:13px;white-space:nowrap;">${label}</td>` +
        `<td style="padding:6px 0;color:#111113;font-size:13px;">${
          href ? `<a href="${href}" style="color:#2f4661;">${value}</a>` : value
        }</td></tr>`
      : "";
  const entries = Object.entries(opts.answers || {}).filter(([, v]) => `${v ?? ""}`.trim());
  const answerRows = entries
    .map(([k, v]) => {
      const flagged = k.startsWith("\u26a0");
      return `<tr><td style="padding:7px 12px 7px 0;font-size:13px;white-space:nowrap;color:${
        flagged ? "#92400e" : "#5f5f66"
      };font-weight:${flagged ? 700 : 400};">${k}</td>` +
        `<td style="padding:7px 0;font-size:13px;color:#111113;">${String(v)}</td></tr>`;
    })
    .join("");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="background-color:#9e9e9e;background:linear-gradient(135deg,#dedede 0%,#9e9e9e 50%,#6b7a90 100%);border-radius:16px;padding:26px 30px;color:#0f0f11;">
      <img src="https://vexon-os.example/brand/vexon-logo-white.png" width="120" alt="Vexon OS" style="display:block;width:120px;height:auto;border:0;" />
      <h1 style="margin:8px 0 0;font-size:21px;">New booking \u2014 your brief</h1>
    </div>
    <div style="background:#ffffff;border:1px solid #e3e3e6;border-radius:16px;padding:24px 30px;margin-top:16px;color:#111113;">
      <p style="margin:0 0 6px;">Hi ${opts.hostName || "there"},</p>
      <p style="margin:0 0 16px;"><strong>${opts.eventName}</strong></p>
      <p style="margin:0 0 18px;font-size:17px;font-weight:700;color:#2f4661;">${opts.whenLocal} (UK time)</p>
      <table style="border-collapse:collapse;width:100%;">
        ${row("Prospect", opts.prospectName)}
        ${row("Company", opts.companyName)}
        ${row("Email", opts.prospectEmail, `mailto:${opts.prospectEmail}`)}
        ${row("Mobile", opts.prospectMobile, `tel:${opts.prospectMobile}`)}
        ${row("Website", opts.companyWebsite, opts.companyWebsite)}
        ${row("LinkedIn", opts.prospectLinkedin, opts.prospectLinkedin)}
        ${row("Close lead", opts.closeLeadLink ? "Open in Close" : "", opts.closeLeadLink)}
      </table>
      ${
        answerRows
          ? `<p style="margin:22px 0 6px;font-size:12px;letter-spacing:1.4px;color:#8e8e96;font-weight:700;">WHAT THE SETTER RECORDED</p>
             <table style="border-collapse:collapse;width:100%;">${answerRows}</table>`
          : ""
      }
      <p style="margin:22px 0 0;color:#5f5f66;font-size:12px;">Booked ${opts.bookedBy}. These answers are in Vexon OS too \u2014 they are deliberately kept out of the calendar invite, which the prospect can read.</p>
    </div>
    <p style="text-align:center;color:#5f5f66;font-size:11px;margin-top:14px;">Powered by Vexon OS Bookings</p>
  </div></body></html>`;
}

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

    // Attendance confirmation (kept for future use; the branded email button
    // was retired 2026-08-20 in favour of the Google invite).
    if (action === "confirm") {
      const bookingId = clip(body.booking_id, 40);
      if (!/^[0-9a-f-]{36}$/.test(bookingId)) return json({ error: "Invalid link" }, 400);
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, status, starts_at, meeting_id, prospect_name, prospect_confirmed_at, booking_event_types(name), host_user_id")
        .eq("id", bookingId)
        .maybeSingle();
      if (!booking || !["confirmed", "completed"].includes(booking.status)) {
        return json({ error: "This booking could not be found" }, 404);
      }
      if (!booking.prospect_confirmed_at) {
        await supabase.from("bookings")
          .update({ prospect_confirmed_at: new Date().toISOString() })
          .eq("id", bookingId);
        if (booking.meeting_id) {
          await supabase.from("meetings")
            .update({ client_accepted: true, accepted_by_client: true })
            .eq("id", booking.meeting_id);
        }
      }
      const { data: hostProfile } = await supabase
        .from("profiles").select("full_name").eq("id", booking.host_user_id).maybeSingle();
      return json({
        event_name: (booking as any).booking_event_types?.name || "your meeting",
        starts_at: booking.starts_at,
        host_name: hostProfile?.full_name || null,
        prospect_name: booking.prospect_name,
      });
    }

    // Staff-only: dereference a pasted Close lead link into prospect details.
    if (action === "close_lead") {
      const staff = await staffUser(supabase, req);
      if (!staff) return json({ error: "Sign in to Vexon OS to use Close lookup" }, 401);
      const leadMatch = clip(body.close_lead_link, 500).match(/lead_[A-Za-z0-9]+/);
      if (!leadMatch) return json({ error: "That doesn't look like a Close lead link" }, 400);
      // Trial Day (22 Sep 2026): trialists dial in their OWN Close org
      // ("Meridian Trial Day"), which none of the sales keys can read — the
      // Auto-fill button just said "Lead not found". Their leads resolve with
      // TRIALIST_API_KEY, and a trialist is held to that org alone so a real
      // acquisition lead can never be dereferenced from the trial portal.
      // If the trial key isn't configured, fall back to the normal list.
      const trialKey = Deno.env.get("TRIALIST_API_KEY") || Deno.env.get("CLOSE_API_KEY_TRIAL");
      const isTrialist = staff.roles.includes("trialist");
      const apiKeys = [...new Set(
        (isTrialist && trialKey
          ? [trialKey]
          : [
              Deno.env.get("CLOSE_API_KEY_ACQUISITION"),
              Deno.env.get("CLOSE_API_KEY"),
              Deno.env.get("CLOSE_API_KEY_FULFILMENT"),
              trialKey,
            ]
        ).filter((k): k is string => !!k),
      )];
      if (apiKeys.length === 0) return json({ error: "Close is not connected" }, 502);
      let lead: any = null;
      for (const apiKey of apiKeys) {
        const res = await fetch(`https://api.close.com/api/v1/lead/${leadMatch[0]}/`, {
          headers: { Authorization: "Basic " + btoa(`${apiKey}:`) },
        });
        if (res.ok) { lead = await res.json(); break; }
        if (res.status !== 404 && res.status !== 401 && res.status !== 403) {
          console.error("[booking-public] Close lookup error:", res.status, await res.text());
        }
      }
      if (!lead) {
        return json({
          error: isTrialist
            ? (trialKey
                ? "That lead isn't in the trial Close workspace. Copy the link from the lead page in Close."
                : "The trial Close workspace isn't connected yet (TRIALIST_API_KEY). Tell your team lead.")
            : "Lead not found in any connected Close org",
        }, 404);
      }
      const contact = (lead.contacts || [])[0] || {};
      // Website: Close returns the company site as the lead's top-level `url`.
      // The old `urls[0].url` read never matched, which is why website was
      // always blank (verified against a live lead, 25 Aug).
      const website = lead.url || (lead.urls || [])[0]?.url || null;
      // LinkedIn: stored as a lead CUSTOM FIELD (e.g. "Company Linkedin URL"),
      // not in urls. The field id differs between the acquisition and
      // fulfilment Close orgs, so match on the field NAME — and fall back to
      // scanning any custom value that looks like a LinkedIn URL, because the
      // REST API flattens custom fields to "custom.cf_..." keys with no names.
      const linkedinFrom = (obj: any): string | null => {
        if (!obj || typeof obj !== "object") return null;
        const arr = Array.isArray(obj.custom_fields) ? obj.custom_fields : [];
        const named = arr.find(
          (f: any) => typeof f?.name === "string" && f.name.toLowerCase().includes("linkedin"),
        );
        if (named?.value) return String(named.value);
        for (const [k, v] of Object.entries(obj)) {
          if (!k.toLowerCase().startsWith("custom")) continue;
          if (typeof v === "string" && /linkedin\.com/i.test(v)) return v;
        }
        return null;
      };
      // Prefer the contact's personal profile over the company page.
      const contactLinkedin =
        (contact.urls || []).find((u: any) => /linkedin\.com/i.test(u?.url || ""))?.url || null;
      const rawLinkedin = contactLinkedin || linkedinFrom(contact) || linkedinFrom(lead);
      // Close stores these bare ("uk.linkedin.com/company/x") — make it clickable.
      const linkedin = rawLinkedin
        ? (/^https?:\/\//i.test(rawLinkedin) ? rawLinkedin : `https://${rawLinkedin}`)
        : null;
      // Email deliberately NOT returned (the owner 2026-08-20): Close emails are
      // often wrong, and the invite lives or dies on the address — the setter
      // types it themselves.
      // Industry (12 Oct, warm leads): a lead custom field whose name contains
      // "industry", matched by name like LinkedIn above. Absent on most orgs.
      const industryFrom = (obj: any): string | null => {
        const arr = Array.isArray(obj?.custom_fields) ? obj.custom_fields : [];
        const named = arr.find((f: any) => typeof f?.name === "string" && f.name.toLowerCase().includes("industry"));
        return named?.value ? String(named.value) : null;
      };
      return json({
        company_name: lead.display_name || lead.name || null,
        company_website: website,
        linkedin_url: linkedin,
        contact_name: contact.name || null,
        contact_title: contact.title || null,
        mobile: (contact.phones || [])[0]?.phone || null,
        industry: industryFrom(lead),
      });
    }

    // Staff-only: mint a one-time follow-up link the AE sends the prospect,
    // who then picks their own time. The row id IS the token, so no prospect
    // details travel in the URL. Idempotent per meeting: asking twice returns
    // the same live invite rather than minting a second one.
    if (action === "create_invite") {
      const staff = await staffUser(supabase, req);
      if (!staff) return json({ error: "Sign in to Vexon OS to create a booking link" }, 401);
      const meetingId = clip(body.meeting_id, 40);
      if (!/^[0-9a-f-]{36}$/.test(meetingId)) return json({ error: "A meeting is required" }, 400);

      const { data: meeting } = await supabase
        .from("meetings")
        .select("id, prospect_name, prospect_email, prospect_mobile, company_name, assigned_ae_id")
        .eq("id", meetingId).maybeSingle();
      if (!meeting) return json({ error: "Meeting not found" }, 404);

      // The link books the AE who owns the meeting; fall back to whoever is
      // asking (an AE acting on their own meeting).
      const hostUserId = meeting.assigned_ae_id || staff.id;

      // Prefer that AE's OWN follow-up event (Oliver has one so he can also
      // bookmark and share it); otherwise the shared follow-up event. An
      // explicit event_slug still wins, for callers that know what they want.
      const explicitSlug = clip(body.event_slug, 120);
      let ev: { id: string; slug: string } | null = null;
      if (explicitSlug) {
        const { data } = await supabase
          .from("booking_event_types").select("id, slug")
          .eq("slug", explicitSlug).eq("is_active", true).maybeSingle();
        ev = data;
      } else {
        const { data: own } = await supabase
          .from("booking_event_types").select("id, slug")
          .eq("owner_user_id", hostUserId).eq("event_purpose", "follow_up")
          .eq("is_active", true).limit(1).maybeSingle();
        ev = own;
        if (!ev) {
          const { data: shared } = await supabase
            .from("booking_event_types").select("id, slug")
            .eq("slug", "follow-up-call-msp-t6v3x").eq("is_active", true).maybeSingle();
          ev = shared;
        }
      }
      if (!ev) return json({ error: "The follow-up event is not available" }, 404);
      const { data: isHost } = await supabase
        .from("booking_event_hosts").select("id")
        .eq("event_type_id", ev.id).eq("host_user_id", hostUserId).maybeSingle();
      if (!isHost) {
        return json({ error: "That AE is not set up as a host on the follow-up event" }, 409);
      }

      const { data: existing } = await supabase
        .from("booking_follow_up_invites")
        .select("id, expires_at")
        .eq("meeting_id", meetingId)
        .is("used_at", null).is("cancelled_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (existing) return json({ invite_id: existing.id, slug: ev.slug, reused: true });

      const { data: created, error: cErr } = await supabase
        .from("booking_follow_up_invites")
        .insert({
          event_type_id: ev.id,
          host_user_id: hostUserId,
          meeting_id: meetingId,
          prospect_name: meeting.prospect_name,
          prospect_email: meeting.prospect_email,
          prospect_mobile: meeting.prospect_mobile,
          company_name: meeting.company_name,
          created_by: staff.id,
        })
        .select("id").single();
      if (cErr) return json({ error: cErr.message }, 500);
      return json({ invite_id: created.id, slug: ev.slug, reused: false });
    }

    // Fulfilment hub: every active client, so a setter can book for whichever
    // client the prospect belongs to (the owner, 8 Oct: Chiron was rostered on
    // Ridgeway Legal but had to book for another client off a pasted link).
    // Today's roster (roster_entries) only marks which ones are "theirs";
    // picking any other client is a warning on the page, never a block.
    if (action === "fulfilment_context") {
      const staff = await staffUser(supabase, req);
      if (!staff) return json({ error: "Sign in to Vexon OS to book for a client" }, 401);
      const isAdmin = staff.roles.some((r: string) => STAFF_ADMIN_TIER.includes(r));
      const { data: sp } = await supabase
        .from("setters_profiles").select("id").eq("user_id", staff.id).maybeSingle();
      if (!isAdmin && !sp) {
        return json({ error: "Client booking is for setters — ask your manager for access" }, 403);
      }

      const today = new Date().toISOString().slice(0, 10);
      const [{ data: clients }, { data: events }, { data: conns }, { data: roster }] = await Promise.all([
        supabase.from("client_profiles")
          // is_test_account: Meridian Sales Partners is our own test client (the owner, 8 Oct).
          .select("id, company_name, logo").eq("status", "active").eq("is_test_account", false)
          .order("company_name"),
        supabase.from("booking_event_types")
          .select("slug, client_id, accepting_bookings")
          .eq("is_active", true).not("client_id", "is", null),
        supabase.from("calendar_connections")
          .select("client_profile_id").eq("owner_type", "client").eq("status", "connected"),
        sp
          ? supabase.from("roster_entries").select("client_profile_id")
              .eq("setter_profile_id", sp.id).eq("roster_date", today)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const eventByClient = new Map((events || []).map((e: any) => [e.client_id as string, e]));
      const connected = new Set((conns || []).map((c: any) => c.client_profile_id as string));
      const rostered = new Set((roster || []).map((r: any) => r.client_profile_id as string));

      const list = (clients || []).map((c: any) => {
        const ev: any = eventByClient.get(c.id);
        return {
          id: c.id,
          name: c.company_name,
          logo: c.logo || null,
          event_slug: ev?.slug || null,
          accepting: ev ? ev.accepting_bookings !== false : false,
          calendar_connected: connected.has(c.id),
          rostered: rostered.has(c.id),
        };
      });
      // Their own client(s) first, then everyone else alphabetically (stable sort).
      list.sort((a: any, b: any) => Number(b.rostered) - Number(a.rostered));
      return json({ is_admin: isAdmin, clients: list });
    }

    // ── Trial day (16 Oct 2026, the owner) ─────────────────────────────────
    // The trialist's booking window: a client's real free times, asked for
    // by client id so no slug (which carries the client's name) or event
    // name ever reaches the trialist. Only a client this trialist represents.
    if (action === "trial_slots") {
      const staff = await staffUser(supabase, req);
      if (!staff || !staff.roles.includes("trialist")) return json({ error: "Sign in to your trial day to see times" }, 401);
      const clientId = clip(body.client_profile_id, 40);
      if (!/^[0-9a-f-]{36}$/.test(clientId)) return json({ error: "Pick the client you are representing" }, 400);
      if (!(await trialistRepresents(supabase, staff.id, clientId))) {
        return json({ error: "That is not a client you are representing" }, 403);
      }
      const found = await trialClientEvent(supabase, clientId);
      if (!found) return json({ error: "This client is not taking bookings right now. Tell Elena." }, 409);
      const wantsCallback = clip(body.location_choice, 10) === "phone";
      if (wantsCallback && !found.ev.offer_phone_choice) return json({ error: "This client does not take callbacks" }, 409);
      try {
        const r = await trialSlotsFor(supabase, found, wantsCallback ? "phone" : "video");
        return json({
          slots: r.slots,
          calendar_checked: r.calendar_checked,
          duration_minutes: r.callback ? CALLBACK_MINUTES : found.ev.duration_minutes,
          horizon_days: horizonDays(found.ev),
          callback_available: !!found.ev.offer_phone_choice,
          callback: r.callback,
        });
      } catch (e) {
        console.error("[booking-public] trial_slots:", e);
        return json({ error: "Could not load the client's times. Try again shortly." }, 502);
      }
    }

    // Elena (Ops Command) or Daniel: the free times for a trialist's lead,
    // worked out exactly as book_trial_lead will check them.
    if (action === "trial_lead_slots" || action === "book_trial_lead") {
      const staff = await staffUser(supabase, req);
      const reviewer = !!staff && staff.roles.some((r: string) => TRIAL_REVIEWER_ROLES.includes(r));
      if (!reviewer) return json({ error: "Only Ops Command or the CSM can book trialist leads" }, 403);
      const leadId = clip(body.lead_id, 40);
      if (!/^[0-9a-f-]{36}$/.test(leadId)) return json({ error: "lead_id is required" }, 400);
      const { data: lead } = await supabase.from("trial_leads").select("*").eq("id", leadId).maybeSingle();
      if (!lead) return json({ error: "That lead no longer exists" }, 404);
      if (!lead.client_profile_id) return json({ error: "That lead has no client on it" }, 422);
      const found = await trialClientEvent(supabase, lead.client_profile_id);
      if (!found) return json({ error: "This client is not taking bookings right now" }, 409);

      if (action === "trial_lead_slots") {
        try {
          const r = await trialSlotsFor(supabase, found, lead.location_choice === "phone" ? "phone" : "video");
          return json({ slots: r.slots, callback: r.callback, calendar_checked: r.calendar_checked });
        } catch (e) {
          console.error("[booking-public] trial_lead_slots:", e);
          return json({ error: "Could not check the client's calendar. Try again shortly." }, 502);
        }
      }

      // ── book_trial_lead: a real booking on the client's calendar (invite,
      // text, email, reminders) and a fulfilment meeting on the client's
      // profile, credited to no setter (the owner, 16 Oct).
      const startMs = Date.parse(clip(body.starts_at, 40));
      if (!Number.isFinite(startMs)) return json({ error: "starts_at is required" }, 400);
      const wanted = new Date(startMs).toISOString();
      if (!EMAIL_RE.test(lead.contact_email || "")) return json({ error: "That lead has no valid email to send the invite to" }, 422);
      let r: { slots: Array<{ starts_at: string }>; callback: boolean; locationChoice: "video" | "phone" | null };
      try {
        r = await trialSlotsFor(supabase, found, lead.location_choice === "phone" ? "phone" : "video");
      } catch (e) {
        console.error("[booking-public] book_trial_lead slots:", e);
        return json({ error: "Could not check the client's calendar. Try again shortly." }, 502);
      }
      if (r.callback && !lead.contact_mobile) return json({ error: "A callback needs the prospect's mobile" }, 422);
      if (!r.slots.some((s) => s.starts_at === wanted)) {
        return json({ error: "That time is no longer free on the client's calendar. Pick another." }, 409);
      }

      // Claim the lead first, so Elena and Daniel can never book it twice.
      const claimedAt = new Date().toISOString();
      const { data: claimed } = await supabase.from("trial_leads")
        .update({ status: "converted", converted_by: staff!.id, converted_at: claimedAt, reviewed_by: staff!.id, reviewed_at: claimedAt })
        .eq("id", lead.id).neq("status", "converted")
        .select("id").maybeSingle();
      if (!claimed) return json({ error: "That lead is already booked" }, 409);
      const release = async () => {
        await supabase.from("trial_leads")
          .update({ status: lead.status, converted_by: null, converted_at: null, reviewed_by: lead.reviewed_by, reviewed_at: lead.reviewed_at })
          .eq("id", lead.id);
      };

      const { data: trialist } = await supabase
        .from("profiles").select("full_name, email").eq("id", lead.trialist_user_id).maybeSingle();
      const trialistName = trialist?.full_name || trialist?.email || "a trialist";
      const bookedBy = staff!.email || "Ops Command";
      const { data: cp } = await supabase
        .from("client_profiles").select("company_name, email").eq("id", lead.client_profile_id).maybeSingle();
      // The other picked times that are still free travel as callback backups.
      const backups = ((lead.chosen_times || []) as string[])
        .map((t) => new Date(t).toISOString())
        .filter((t) => t !== wanted && r.slots.some((s) => s.starts_at === t));
      const roles: Array<{ title: string; salary: number | null; currency: string }> = Array.isArray(lead.job_roles) ? lead.job_roles : [];
      const answers: Record<string, unknown> = {
        "Booked by": `From trial day: logged by ${trialistName}, booked by ${bookedBy}`,
        "Hiring in the next 3 months": lead.currently_hiring ? "Yes" : "No",
      };
      if (lead.currently_hiring) {
        answers["Roles"] = roles.map((x) => x.title + (x.salary != null ? ` (${x.currency} ${x.salary})` : "")).join("; ");
        answers["Job spec available"] = lead.job_spec_provided ? "Yes" : "No";
      } else {
        answers["Open to receiving CVs"] = lead.open_to_receiving_cvs ? "Yes" : "No";
        if (lead.open_to_receiving_cvs) {
          answers["Candidates interested in"] = lead.cv_candidate_titles;
          answers["Candidate level"] = lead.cv_candidate_level;
        }
      }
      answers["Other decision makers"] = lead.other_decision_makers
        ? `Yes, ${lead.decision_maker_status}${lead.decision_maker_email ? ` (${lead.decision_maker_email})` : ""}`
        : "No";
      if (lead.push_through_reason) answers["⚠ Not qualified, pushed through because"] = lead.push_through_reason;

      const local = utcToZonedParts(wanted, "Europe/London");
      const noteLines = [
        `Trial day lead logged by ${trialistName}. Booked by ${bookedBy}.`,
        r.callback ? `Callback (${CALLBACK_MINUTES} min, UK time)${backups.length ? `. If no answer, also free: ${backups.map(backupLabel).join("; ")}` : ""}` : null,
        lead.push_through_reason ? `⚠ Not qualified, pushed through: ${lead.push_through_reason}` : null,
        lead.trialist_notes ? `Trialist notes: ${lead.trialist_notes}` : null,
      ].filter(Boolean);
      const { data: meeting, error: mErr } = await supabase
        .from("meetings")
        .insert({
          prospect_name: lead.contact_name || lead.company_name || "Prospect",
          prospect_email: lead.contact_email,
          prospect_mobile: lead.contact_mobile || null,
          prospect_job_title: lead.contact_title || null,
          company_name: lead.company_name || lead.contact_name || "Unknown company",
          company_website: lead.company_website || null,
          prospect_linkedin: lead.linkedin_url || null,
          close_lead_link: lead.close_lead_link || null,
          meeting_date: local.date,
          meeting_time: local.time,
          status: "pending",
          department: "fulfilment",
          lead_type: r.callback ? "mobile_phone_call" : "video_conference",
          is_rebook: false,
          client_profile_id: lead.client_profile_id,
          currently_hiring: lead.currently_hiring,
          open_to_receiving_cvs: lead.open_to_receiving_cvs,
          job_roles: roles.length > 0 ? roles : null,
          next_job_title: roles[0]?.title || null,
          job_spec_provided: lead.job_spec_provided,
          cv_candidate_titles: lead.cv_candidate_titles || null,
          cv_candidate_level: lead.cv_candidate_level || null,
          other_decision_makers: lead.other_decision_makers,
          decision_maker_status: lead.decision_maker_status,
          decision_maker_email: lead.decision_maker_email || null,
          trial_lead_id: lead.id,
          notes: noteLines.join("\n"),
        })
        .select("id").single();
      if (mErr || !meeting) {
        console.error("[booking-public] book_trial_lead meeting:", mErr);
        await release();
        return json({ error: mErr?.message || "Could not log the meeting" }, 500);
      }
      let result: Awaited<ReturnType<typeof runBookingFlow>>;
      try {
        result = await runBookingFlow(supabase, {
          eventType: found.ev,
          host: {
            client_profile_id: found.host.client_profile_id,
            client_name: found.host.external_name || cp?.company_name || null,
            client_email: found.host.external_email || cp?.email || null,
            extra_attendees: lead.decision_maker_status === "joining" && EMAIL_RE.test(lead.decision_maker_email || "")
              ? [lead.decision_maker_email]
              : [],
          },
          startsAt: wanted,
          prospectName: lead.contact_name || lead.company_name,
          prospectEmail: lead.contact_email,
          prospectMobile: lead.contact_mobile,
          answers,
          meetingId: meeting.id,
          source: "admin",
          createdBy: staff!.id,
          locationChoice: r.locationChoice,
          prospectTimezone: "Europe/London",
          bookedByLabel: `by ${bookedBy} (trial day lead)`,
          companyName: lead.company_name,
          callbackBackupTimes: backups,
        });
      } catch (e) {
        console.error("[booking-public] book_trial_lead flow:", e);
        result = { ok: false, status: 500, error: e instanceof Error ? e.message : "Booking failed" };
      }
      if (!result.ok) {
        await supabase.from("meetings").delete().eq("id", meeting.id);
        await release();
        return json({ error: result.error }, result.status);
      }
      const { error: linkErr } = await supabase.from("trial_leads")
        .update({ converted_meeting_id: meeting.id }).eq("id", lead.id);
      if (linkErr) console.error("[booking-public] book_trial_lead link:", linkErr);
      return json({ ok: true, booking_id: result.booking_id, meeting_id: meeting.id, starts_at: result.starts_at, sms_sent: result.sms_sent, calendar_created: result.calendar_created });
    }

    const slug = clip(body.slug, 120);
    if (!slug) return json({ error: "slug is required" }, 400);
    const eventType = await loadEvent(supabase, slug);
    if (!eventType) return json({ error: "This booking link is not available" }, 404);
    const hosts = sortedHosts(eventType);

    // Tokenised follow-up link. The token pins the host, prefills the prospect
    // and is the ONLY way to reach an invite_only event.
    const inviteToken = clip(body.invite, 40);
    let invite: any = null;
    if (inviteToken && /^[0-9a-f-]{36}$/.test(inviteToken)) {
      const { data: inv } = await supabase
        .from("booking_follow_up_invites")
        .select("*")
        .eq("id", inviteToken)
        .eq("event_type_id", eventType.id)
        .maybeSingle();
      if (!inv) return json({ error: "This booking link is not valid" }, 404);
      if (inv.cancelled_at) return json({ error: "This booking link has been cancelled" }, 410);
      if (inv.used_at) return json({ error: "This booking link has already been used" }, 410);
      if (new Date(inv.expires_at) < new Date()) {
        return json({ error: "This booking link has expired — ask for a new one" }, 410);
      }
      invite = inv;
    }
    if (eventType.invite_only && !invite) {
      return json({ error: "This event can only be booked from a personal link" }, 403);
    }
    if (invite) {
      // The link is bound to one AE's calendar — the prospect cannot pick a
      // different host, and round robin is meaningless here.
      body.host_user_id = invite.host_user_id;
      eventType.round_robin = false;
    }

    if (action === "event") {
      const hostIds = hosts.map((h: any) => h.host_user_id).filter(Boolean);
      let hostInfos: Array<{ host_user_id: string; name: string }> = [];
      if (hostIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles").select("id, full_name").in("id", hostIds);
        hostInfos = hosts
          .filter((h: any) => h.host_user_id)
          .map((h: any) => ({
            host_user_id: h.host_user_id,
            name: (profiles || []).find((p: any) => p.id === h.host_user_id)?.full_name || "Host",
          }));
      }
      // Client events: the page shows "Booking for: {client}" and swaps the
      // generic questions for the fulfilment qualification flow.
      let client: { name: string; logo: string | null } | null = null;
      if (eventType.client_id) {
        const { data: c } = await supabase
          .from("client_profiles").select("company_name, logo")
          .eq("id", eventType.client_id).maybeSingle();
        client = c ? { name: c.company_name, logo: c.logo || null } : null;
      }
      // The copy-link button on a client page carries the signed-in setter's
      // tag (?ref=<setters_profiles.id>) so a prospect who books themselves
      // from it is credited to that setter (the owner, 8 Oct).
      let myRef: string | null = null;
      if (eventType.client_id) {
        const staff = await staffUser(supabase, req);
        if (staff) {
          const { data: sp } = await supabase
            .from("setters_profiles").select("id").eq("user_id", staff.id).maybeSingle();
          myRef = sp?.id || null;
        }
      }
      return json({
        name: eventType.name,
        description: eventType.description,
        duration_minutes: eventType.duration_minutes,
        // 17 Sep: how far ahead the calendar may go (NULL = 31 days).
        booking_horizon_days: eventType.booking_horizon_days ?? null,
        questions: eventType.questions || [],
        hosts: hostInfos,
        round_robin: !!eventType.round_robin,
        staff_mode: !!eventType.staff_mode,
        lock_timezone: eventType.lock_timezone || null,
        accepting_bookings: eventType.accepting_bookings !== false,
        location_type: eventType.location_type || "google_meet",
        // The room link itself is never exposed before booking — only which
        // platform the call runs on, so the page can label it honestly.
        offer_phone_choice: !!eventType.offer_phone_choice,
        // 16 Oct (the owner): on a client event the phone choice is a Callback.
        callback: eventType.client_id && eventType.offer_phone_choice
          ? { minutes: CALLBACK_MINUTES, max_backups: CALLBACK_MAX_BACKUPS }
          : null,
        // Some public links (e.g. an AE's own discovery link) still want the
        // "that looks like a personal address" prompt, even though nobody is
        // signed in. Per-event so the ads link is unaffected.
        warn_personal_email: !!eventType.warn_personal_email,
        is_client_event: !!eventType.client_id,
        // Client events: whether a prospect on the public link answers the
        // prospect-worded hiring questions (Dev Centre switch, default on).
        public_quals: eventType.public_quals_enabled !== false,
        my_ref: myRef,
        // Follow-up pages hide the company/website/LinkedIn boxes and offer
        // "add guests" instead (Marcus, 2 Sep).
        event_purpose: eventType.event_purpose || null,
        client,
        // Invite links prefill the prospect's own details (held server-side,
        // never in the URL) so they only have to pick a time.
        invite: invite
          ? {
              prospect_name: invite.prospect_name || "",
              prospect_email: invite.prospect_email || "",
              prospect_mobile: invite.prospect_mobile || "",
              company_name: invite.company_name || "",
            }
          : null,
      });
    }

    if (action === "availability") {
      if (eventType.accepting_bookings === false) {
        return json({ error: "Not currently accepting bookings" }, 409);
      }
      const pool = eventType.client_id
        ? hosts.filter((h: any) => h.client_profile_id).slice(0, 1)
        : eventType.round_robin
        ? hosts
        : hosts.filter((h: any) => !body.host_user_id || h.host_user_id === body.host_user_id).slice(0, 1);
      if (pool.length === 0) return json({ error: "No host is available for this event" }, 409);
      // Callback slots when the page has Callback picked on a client event, or
      // when Move appointment is moving an existing callback.
      const wantsCallback = isCallbackBooking(eventType, clip(body.location_choice, 10));
      try {
        const results = await Promise.all(pool.map((h: any) =>
          computeSlots(supabase, eventType, hostRefOf(h), wantsCallback
            ? callbackSlotOpts(eventType)
            : { days: Math.min(Number(body.days) || horizonDays(eventType), horizonDays(eventType)) })
        ));
        // Round robin: a slot is open if ANY host is free then.
        const seen = new Set<string>();
        const merged: Array<{ starts_at: string; ends_at: string }> = [];
        for (const r of results) {
          for (const s of r.slots) {
            if (!seen.has(s.starts_at)) { seen.add(s.starts_at); merged.push(s); }
          }
        }
        merged.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        return json({
          slots: merged,
          calendar_checked: results.some((r) => r.calendar_checked),
          host_user_id: pool.length === 1 ? pool[0].host_user_id : null,
          duration_minutes: wantsCallback ? CALLBACK_MINUTES : eventType.duration_minutes,
          callback: wantsCallback,
        });
      } catch (e) {
        console.error("[booking-public] free/busy failed:", e);
        return json({ error: "Could not load availability — try again shortly" }, 502);
      }
    }

    if (action === "book") {
      if (eventType.accepting_bookings === false) {
        return json({ error: "Not currently accepting bookings" }, 409);
      }
      if (clip(body.website, 10)) return json({ error: "Could not complete the booking" }, 400);

      const prospectName = clip(body.prospect_name, 120);
      const prospectEmail = clip(body.prospect_email, 200);
      const prospectMobile = clip(body.prospect_mobile, 40);
      const closeLeadLink = clip(body.close_lead_link, 500);
      const companyName = clip(body.company_name, 200);
      // Pulled from Close (or typed by the setter) — Marcus wants these on the
      // meeting record and, for Live Call Trials, in the calendar invite.
      const companyWebsite = clip(body.company_website, 500);
      const prospectLinkedin = clip(body.prospect_linkedin, 500);
      const startsAt = clip(body.starts_at, 40);
      if (!prospectName || !EMAIL_RE.test(prospectEmail) || !startsAt) {
        return json({ error: "Name, a valid email, and a time are required" }, 400);
      }

      // Per-booking video-or-phone choice, only where the event offers it.
      // A phone call is worthless without a number, so require one.
      const rawChoice = clip(body.location_choice, 10);
      const locationChoice = eventType.offer_phone_choice &&
        (rawChoice === "video" || rawChoice === "phone") ? rawChoice : null;
      if (locationChoice === "phone" && !prospectMobile) {
        return json({ error: "Add a phone number for a phone call" }, 422);
      }
      // 16 Oct (the owner): a client event's phone choice is a callback, with up to
      // two backup times the prospect could also do.
      const isCallback = isCallbackBooking(eventType, locationChoice);
      const rawBackups: unknown[] = isCallback && Array.isArray(body.callback_backup_times)
        ? body.callback_backup_times.slice(0, CALLBACK_MAX_BACKUPS + 1)
        : [];
      if (rawBackups.length > CALLBACK_MAX_BACKUPS) {
        return json({ error: `Pick up to ${CALLBACK_MAX_BACKUPS} backup times` }, 422);
      }
      const backupTimes: string[] = [];
      for (const raw of rawBackups) {
        const ms = Date.parse(clip(raw, 40));
        if (!Number.isFinite(ms)) return json({ error: "A backup time could not be read, pick it again" }, 422);
        const iso = new Date(ms).toISOString();
        if (!backupTimes.includes(iso)) backupTimes.push(iso);
      }

      // Resolved here (rather than after host selection) because the question
      // gate below needs to know whether a signed-in setter is booking.
      const staff = await staffUser(supabase, req);

      const answers: Record<string, unknown> = {};
      const rawAnswers = body.answers && typeof body.answers === "object" ? body.answers : {};
      // Marcus's qualification trees REPLACE the event's own question list on
      // the booking page — the acquisition tree for signed-in staff, the
      // fulfilment tree on client events — so those q-ids never arrive. Each
      // tree is validated server-side further down, and that is the real gate.
      //
      // Without this, every setter booking on the staff discovery link was
      // rejected with "Please answer: Roughly what was your revenue..." before
      // the tree's answers were populated ~90 lines later (live bug, 25-26 Aug;
      // the page surfaced it only as "Edge Function returned a non-2xx status
      // code", which is why it went unnoticed).
      const treeSuppliesAnswers =
        !!eventType.client_id ||
        (!!eventType.staff_mode && !!staff && !!body.acquisition_quals);
      for (const q of eventType.questions || []) {
        const v = clip(rawAnswers[q.id] ?? rawAnswers[q.label], 2000);
        if (!treeSuppliesAnswers && q.required && !v) {
          return json({ error: `Please answer: ${q.label}` }, 400);
        }
        if (v) answers[q.label] = v;
      }

      // Candidate hosts: client events use their single client host; round
      // robin shuffles everyone free at that slot; otherwise the picked host.
      let pool = eventType.client_id
        ? hosts.filter((h: any) => h.client_profile_id).slice(0, 1)
        : eventType.round_robin
        ? hosts
        : hosts.filter((h: any) => !body.host_user_id || h.host_user_id === body.host_user_id).slice(0, 1);
      if (pool.length === 0) return json({ error: "No host is available for this event" }, 409);
      if (eventType.round_robin && !eventType.client_id) {
        pool = [...pool].sort(() => Math.random() - 0.5);
      }

      const wanted = new Date(startsAt).toISOString();
      if (backupTimes.includes(wanted)) {
        return json({ error: "A backup time is the same as the callback time, pick a different one" }, 422);
      }

      // ── Client events: Marcus's qualification, booked by any setter or by
      // the prospect themselves off the client's public link (the owner, 8 Oct).
      // Signed-in staff: any setter may book for any client; one who is not
      // rostered on this client today gets a note on the meeting, not a block.
      // Signed out: the prospect answers the prospect-worded questions (unless
      // the event's public_quals_enabled switch is off), and ?ref= credits the
      // setter whose link it was.
      let fq: FulfilQuals | null = null;
      let reuseMeetingId: string | null = null;
      let clientProfile: { company_name: string; email: string | null } | null = null;
      let creditSetter: { profileId: string | null; userId: string } | null = null;
      let offRoster = false;
      if (eventType.client_id) {
        if (staff) {
          const isAdmin = staff.roles.some((r: string) => STAFF_ADMIN_TIER.includes(r));
          const { data: sp } = await supabase
            .from("setters_profiles").select("id").eq("user_id", staff.id).maybeSingle();
          if (!isAdmin && !sp) {
            return json({ error: "Client booking is for setters — ask your manager for access" }, 403);
          }
          if (sp) {
            const today = new Date().toISOString().slice(0, 10);
            const { data: roster } = await supabase
              .from("roster_entries").select("id")
              .eq("setter_profile_id", sp.id)
              .eq("roster_date", today)
              .eq("client_profile_id", eventType.client_id)
              .limit(1);
            offRoster = !roster || roster.length === 0;
          }
          creditSetter = { profileId: sp?.id || null, userId: staff.id };
          // 12 Oct (SDR streamline): a meeting logged by hand while Kronos was
          // down can be pushed through afterwards. The caller names the row;
          // we reuse it instead of inserting a twin. The row must be this
          // setter's and for this client. Its qualification columns stand in
          // for fulfilment_quals when none are sent.
          const existingId = clip(body.meeting_id, 40);
          if (existingId) {
            const { data: existing } = await supabase
              .from("meetings")
              .select("id, setter_id, logged_by_setter_id, client_profile_id, appointment_source")
              .eq("id", existingId).maybeSingle();
            if (!existing) return json({ error: "That appointment no longer exists" }, 404);
            const mine = existing.setter_id === staff.id || existing.logged_by_setter_id === staff.id || isAdmin;
            if (!mine) return json({ error: "That appointment belongs to another setter" }, 403);
            if (existing.client_profile_id !== eventType.client_id) {
              return json({ error: "That appointment is for a different client" }, 422);
            }
            reuseMeetingId = existing.id;
          }
          if (body.fulfilment_quals || !reuseMeetingId) {
            const parsed = parseFulfilmentQuals(body.fulfilment_quals);
            if (!parsed.ok) return json({ error: parsed.error }, 422);
            fq = parsed.q;
          }
        } else {
          const ref = clip(body.ref, 40);
          if (/^[0-9a-f-]{36}$/.test(ref)) {
            const { data: sp } = await supabase
              .from("setters_profiles").select("id, user_id, status")
              .eq("id", ref).maybeSingle();
            // A stale link from someone who has left still books; it just
            // credits nobody.
            if (sp && (sp.status || "active") === "active") {
              creditSetter = { profileId: sp.id, userId: sp.user_id };
            }
          }
          if (eventType.public_quals_enabled !== false) {
            const parsed = parseFulfilmentQuals(body.fulfilment_quals, { prospect: true });
            if (!parsed.ok) return json({ error: parsed.error }, 422);
            fq = parsed.q;
          }
          answers["Booked by"] = "The prospect, from the public booking link";
        }
        const { data: cp } = await supabase
          .from("client_profiles").select("company_name, email")
          .eq("id", eventType.client_id).maybeSingle();
        clientProfile = cp || null;
      }
      if (fq) {
        // Structured answers onto the booking record (Deliveries tab / audit)
        // — the calendar invite never carries these (privacy fix, 24 Aug).
        answers["Hiring in the next 3 months"] = fq.hiring ? "Yes" : "No";
        if (fq.hiring) {
          answers["Roles"] = fq.roles
            .map((r) => r.title + (r.salary != null ? ` (${r.currency} ${r.salary})` : ""))
            .join("; ");
          answers["Job spec available"] = fq.job_spec ? "Yes" : "No";
        } else {
          answers["Open to receiving CVs"] = fq.open_to_cvs ? "Yes" : "No";
          if (fq.open_to_cvs) {
            answers["Candidates interested in"] = fq.cv_titles;
            answers["Candidate level"] = fq.cv_level;
          }
        }
        answers["Other decision makers"] = fq.dm_present
          ? `Yes — ${fq.dm_status}${fq.dm_email ? ` (${fq.dm_email})` : ""}`
          : "No";
        if (fq.disqualify_reason) {
          answers["⚠ Not qualified — pushed through because"] = fq.disqualify_reason;
        }
      }
      if (offRoster) answers["⚠ Booked outside today's roster"] = "Yes";

      // ── Acquisition staff bookings: Marcus's conditional qual tree (25 Aug),
      // validated server-side like the fulfilment one. A page that predates
      // the tree sends plain jsonb answers instead — those keep the legacy
      // qualColumns path so live setters aren't broken between the function
      // deploy and the frontend Publish.
      let aq: AcqQuals | null = null;
      if (!eventType.client_id && eventType.staff_mode && staff && body.acquisition_quals) {
        const parsed = parseAcquisitionQuals(body.acquisition_quals);
        if (!parsed.ok) return json({ error: parsed.error }, 422);
        aq = parsed.q;
        const dmLabel: Record<string, string> = {
          joining: "joining the discovery call",
          attending_instead: "attending instead of the prospect",
          briefed_by_prospect: "will be briefed by the prospect",
          email_pending: "email to be collected",
        };
        answers["Revenue (last 12 months)"] = aq.revenue_band;
        if (aq.price_qualified !== null) {
          answers["⚠ Under £300k — price qualified"] = aq.price_qualified ? "Yes" : "No";
          answers["⚠ Price qualification reason"] = aq.price_qualified_reason;
        }
        answers["Only decision maker"] = aq.only_dm ? "Yes" : "No";
        if (!aq.only_dm) {
          answers["Other decision maker"] =
            `${aq.dm_name} — ${dmLabel[aq.dm_status || ""] || aq.dm_status}` +
            (aq.dm_email ? ` (${aq.dm_email})` : "");
        }
        answers["Capacity for 5–10 more vacancies per month"] = "Yes";
        if (aq.agency_led) answers["Candidate or industry led"] = aq.agency_led;
        if (aq.vacancies_last_month) {
          answers["Vacancies from new clients last month"] = aq.vacancies_last_month;
        }
        if (aq.bd_bottleneck) answers["Biggest BD bottleneck"] = aq.bd_bottleneck;
        if (aq.target_job_titles) answers["Job titles they want"] = aq.target_job_titles;
      }

      // Personal-email guard — OUTBOUND setter bookings only (staff session on
      // a staff-mode event). A consumer domain blocks the booking unless the
      // setter supplies a push-through reason; the reason travels into the
      // calendar description (via answers) and the logged meeting's notes so
      // the AE and Daniel can see why. Anonymous/inbound bookings are exempt
      // by design — prospects booking themselves use whatever email they like.
      const personalReason = clip(body.personal_email_reason, 500);
      const emailDomain = prospectEmail.toLowerCase().split("@")[1] || "";
      // Fires for outbound setter bookings, and for any event explicitly asking
      // for the prompt (Oliver's own link, 26 Aug). A self-booking prospect
      // only has to confirm; a setter must give a reason.
      const warnPersonal =
        (eventType.staff_mode && !!staff) || !!eventType.warn_personal_email;
      if (warnPersonal && PERSONAL_EMAIL_DOMAINS.has(emailDomain) && !personalReason) {
        return json({
          error:
            "That looks like a personal email address — double-check it, or confirm it to book anyway",
        }, 422);
      }
      if (personalReason) {
        answers["⚠ Personal email — pushed through because"] = personalReason;
      }

      let lastError: { status: number; error: string } | null = null;
      for (const host of pool) {
        // The requested slot must be one the engine would offer this host now.
        try {
          const { slots } = await computeSlots(
            supabase, eventType, hostRefOf(host),
            isCallback ? callbackSlotOpts(eventType) : { days: horizonDays(eventType) },
          );
          if (!slots.some((s) => s.starts_at === wanted)) {
            lastError = { status: 409, error: "That time is no longer available — pick another slot" };
            continue;
          }
          // Backup times must be real callback slots too, or the client is
          // told to ring at a time they are busy.
          const stale = backupTimes.find((t) => !slots.some((s) => s.starts_at === t));
          if (stale) {
            return json({ error: `The backup time ${backupLabel(stale)} is no longer free, pick another` }, 409);
          }
        } catch (e) {
          console.error("[booking-public] slot re-validation failed:", e);
          return json({ error: "Could not verify the slot — try again shortly" }, 502);
        }

        // Staff auto-log: create the dashboard meeting first so the flow syncs
        // date/time + Meet link onto it (Marcus: "it should just get logged").
        let meetingId: string | null = null;
        let insertedMeeting = false;
        if (eventType.client_id && creditSetter && reuseMeetingId) {
          meetingId = reuseMeetingId;
          await supabase.from("meetings")
            .update({ appointment_source: "manual_fallback_sent", close_lead_link: closeLeadLink || undefined })
            .eq("id", reuseMeetingId);
        } else if (eventType.client_id && creditSetter) {
          // Fulfilment: attributed to the setter AND the client — feeds the
          // client's meetings-booked numbers and the setter's target. A
          // self-booked prospect with no setter tag logs nothing (the booking
          // itself still exists), exactly like before.
          const local = utcToZonedParts(wanted, "Europe/London");
          const noteLines = [
            !staff ? "Self-booked by the prospect from the setter's public link" : null,
            isCallback
              ? `Callback (${CALLBACK_MINUTES} min, UK time)${backupTimes.length > 0 ? `. If no answer, also free: ${backupTimes.map(backupLabel).join("; ")}` : ""}`
              : null,
            offRoster ? "⚠ Booked outside today's roster" : null,
            fq?.disqualify_reason ? `⚠ Not qualified — pushed through: ${fq.disqualify_reason}` : null,
            personalReason ? `⚠ Personal email pushed through: ${personalReason}` : null,
          ].filter(Boolean);
          const { data: meeting, error: mErr } = await supabase
            .from("meetings")
            .insert({
              prospect_name: prospectName,
              prospect_email: prospectEmail,
              prospect_mobile: prospectMobile || null,
              company_name: companyName || prospectName,
              company_website: companyWebsite || null,
              prospect_linkedin: prospectLinkedin || null,
              close_lead_link: closeLeadLink || null,
              meeting_date: local.date,
              meeting_time: local.time,
              status: "pending",
              department: "fulfilment",
              // A phone booking is logged as a phone call, the same type the
              // setter's manual Log Meeting "Phone call" option writes.
              lead_type: (locationChoice ?? (eventType.location_type === "phone" ? "phone" : "video")) === "phone"
                ? "mobile_phone_call"
                : "video_conference",
              is_rebook: false,
              setter_id: creditSetter.userId,
              logged_by_setter_id: creditSetter.userId,
              setter_profile_id: creditSetter.profileId,
              client_profile_id: eventType.client_id,
              currently_hiring: fq ? fq.hiring : null,
              open_to_receiving_cvs: fq ? fq.open_to_cvs : null,
              job_roles: fq && fq.roles.length > 0 ? fq.roles : null,
              next_job_title: fq?.roles[0]?.title || null,
              job_spec_provided: fq ? fq.job_spec : null,
              cv_candidate_titles: fq?.cv_titles || null,
              cv_candidate_level: fq?.cv_level || null,
              other_decision_makers: fq ? fq.dm_present : null,
              decision_maker_status: fq ? fq.dm_status : null,
              decision_maker_email: fq?.dm_email || null,
              notes: noteLines.length > 0 ? noteLines.join("\n") : null,
            })
            .select("id")
            .single();
          if (mErr) console.error("[booking-public] fulfilment auto-log failed:", mErr);
          meetingId = meeting?.id || null;
          insertedMeeting = !!meetingId;
        } else if (eventType.staff_mode && staff) {
          const local = utcToZonedParts(wanted, "Europe/London");
          const { data: setterProfile } = await supabase
            .from("setters_profiles").select("id").eq("user_id", staff.id).maybeSingle();
          // Reasons live in columns + notes + bookings.answers only — never in
          // calendar descriptions (privacy ruling, 24 Aug).
          const acqNoteLines = [
            aq?.price_qualified !== null && aq?.price_qualified !== undefined
              ? `⚠ Under £300k — price qualified: ${aq.price_qualified ? "Yes" : "No"} — ${aq.price_qualified_reason}`
              : null,
            personalReason ? `⚠ Personal email pushed through: ${personalReason}` : null,
          ].filter(Boolean);
          const { data: meeting, error: mErr } = await supabase
            .from("meetings")
            .insert({
              prospect_name: prospectName,
              prospect_email: prospectEmail,
              prospect_mobile: prospectMobile || null,
              company_name: companyName || prospectName,
              company_website: companyWebsite || null,
              prospect_linkedin: prospectLinkedin || null,
              close_lead_link: closeLeadLink || null,
              meeting_date: local.date,
              meeting_time: local.time,
              status: "pending",
              department: "acquisition",
              lead_type: "video_conference",
              is_rebook: false,
              setter_id: staff.id,
              logged_by_setter_id: staff.id,
              setter_profile_id: setterProfile?.id || null,
              assigned_ae_id: host.host_user_id,
              appointment_source: eventType.default_source || null,
              notes: acqNoteLines.length > 0 ? acqNoteLines.join("\n") : null,
              ...(aq
                ? {
                    revenue_last_12_months: aq.revenue_band,
                    only_decision_maker: aq.only_dm,
                    price_qualified: aq.price_qualified,
                    price_qualified_reason: aq.price_qualified_reason || null,
                    capacity_5_10: aq.capacity_5_10,
                    agency_led: aq.agency_led || null,
                    vacancies_from_new_clients_last_month: aq.vacancies_last_month || null,
                    bd_bottleneck: aq.bd_bottleneck || null,
                    target_job_titles: aq.target_job_titles || null,
                    decision_maker_name: aq.dm_name || null,
                    decision_maker_status: aq.dm_status,
                    decision_maker_email: aq.dm_email || null,
                  }
                : qualColumns(answers)),
            })
            .select("id")
            .single();
          if (mErr) console.error("[booking-public] auto-log meeting failed:", mErr);
          meetingId = meeting?.id || null;
          insertedMeeting = !!meetingId;
        } else if (eventType.owner_user_id && host.host_user_id && !eventType.client_id) {
          // An AE's OWN link, booked by the prospect themselves (no setter
          // signed in). Without this no meeting row is created at all, so the
          // booking never reaches the AE's dashboard — which is the whole
          // point of Oliver having a link to send out (the owner, 26 Aug).
          //
          // Deliberately scoped to events with an owner: the Meta/LinkedIn ads
          // link is untouched, so acquisition metrics do not change shape
          // without a decision. Give it an owner to opt it in.
          //
          // setter_id / logged_by_setter_id stay NULL — nobody set this; it is
          // inbound, and the AE is the one accountable for it.
          const local = utcToZonedParts(wanted, "Europe/London");
          const { data: meeting, error: mErr } = await supabase
            .from("meetings")
            .insert({
              prospect_name: prospectName,
              prospect_email: prospectEmail,
              prospect_mobile: prospectMobile || null,
              company_name: companyName || prospectName,
              company_website: companyWebsite || null,
              prospect_linkedin: prospectLinkedin || null,
              close_lead_link: closeLeadLink || null,
              meeting_date: local.date,
              meeting_time: local.time,
              status: "pending",
              department: "acquisition",
              lead_type: "video_conference",
              is_rebook: false,
              assigned_ae_id: host.host_user_id,
              appointment_source: eventType.default_source || "inbound",
              notes: personalReason
                ? `⚠ Personal email confirmed by the prospect: ${personalReason}`
                : null,
              ...qualColumns(answers),
            })
            .select("id")
            .single();
          if (mErr) console.error("[booking-public] self-book auto-log failed:", mErr);
          meetingId = meeting?.id || null;
          insertedMeeting = !!meetingId;
        }

        // Per-booking guests (Marcus, 2 Sep — follow-up pages): extra emails
        // invited to the calendar event. Validated + capped server-side.
        const guestEmails: string[] = Array.isArray(body.guest_emails)
          ? [...new Set(
              (body.guest_emails as unknown[])
                .map((g) => clip(String(g ?? ""), 200).trim().toLowerCase())
                .filter((g) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g)),
            )].slice(0, 10)
          : [];

        const flowHost = host.client_profile_id
          ? {
              client_profile_id: host.client_profile_id,
              client_name: host.external_name || clientProfile?.company_name || null,
              client_email: host.external_email || clientProfile?.email || null,
              extra_attendees: [
                ...guestEmails,
                ...(fq?.dm_status === "joining" && fq.dm_email ? [fq.dm_email] : []),
              ],
            }
          : {
              ...host,
              // Acquisition: a joining (or nominated) decision maker gets the
              // calendar invite too — their email is the ONE qual detail that
              // intentionally reaches the calendar.
              extra_attendees: [
                ...guestEmails,
                ...(aq && (aq.dm_status === "joining" || aq.dm_status === "attending_instead") && aq.dm_email
                  ? [aq.dm_email]
                  : []),
              ],
            };
        const result = await runBookingFlow(supabase, {
          eventType, host: flowHost,
          startsAt: wanted,
          prospectName, prospectEmail, prospectMobile,
          answers,
          meetingId,
          source: invite ? "invite" : staff ? "setter" : "public",
          createdBy: staff?.id || null,
          locationChoice,
          prospectTimezone: clip(body.prospect_timezone, 60) || null,
          bookedByLabel: staff ? `by ${staff.email || "a setter"}` : "self-booked via public page",
          companyName: companyName || null,
          callbackBackupTimes: backupTimes,
        });

        if (result.ok) {
          // Burn the invite so the link cannot be reused, and hang the new
          // booking off it for the AE's follow-ups view.
          if (invite) {
            await supabase.from("booking_follow_up_invites")
              .update({ used_at: new Date().toISOString(), used_booking_id: result.booking_id })
              .eq("id", invite.id).is("used_at", null);
          }
          // Host brief (Marcus, 25 Aug): the AE gets the setter's answers by
          // email because the shared calendar invite can never carry them.
          // Acquisition staff bookings only — on a client event the "host" is
          // the client, who must never see the qualification answers.
          if (!eventType.client_id && eventType.staff_mode && host.host_user_id) {
            try {
              const { data: hostProfile } = await supabase
                .from("profiles").select("full_name, email")
                .eq("id", host.host_user_id).maybeSingle();
              if (hostProfile?.email) {
                const local = utcToZonedParts(wanted, "Europe/London");
                const mail = await sendResendEmail(
                  hostProfile.email,
                  `New booking: ${prospectName}${companyName ? ` (${companyName})` : ""} — ${local.date} ${local.time}`,
                  hostBriefHtml({
                    hostName: hostProfile.full_name || "",
                    eventName: eventType.name,
                    whenLocal: `${local.date} at ${local.time}`,
                    prospectName,
                    prospectEmail,
                    prospectMobile,
                    companyName,
                    companyWebsite,
                    prospectLinkedin,
                    closeLeadLink,
                    bookedBy: staff ? `by ${staff.email || "a setter"}` : "via the public page",
                    answers,
                  }),
                );
                if (!mail.ok && mail.attempted) {
                  console.error("[booking-public] host brief failed:", mail.error);
                }
              }
            } catch (e) {
              // Never let the brief break a confirmed booking.
              console.error("[booking-public] host brief threw:", e);
            }
          }
          return json({
            booking_id: result.booking_id,
            starts_at: result.starts_at,
            redirect_url: result.redirect_url,
            meeting_logged: !!meetingId,
            sms_sent: result.sms_sent,
          });
        }
        // Slot race for THIS host — clean up the orphaned auto-log and try the next.
        if (meetingId && insertedMeeting) await supabase.from("meetings").delete().eq("id", meetingId);
        if (meetingId && !insertedMeeting) {
          await supabase.from("meetings").update({ appointment_source: "manual_fallback" }).eq("id", meetingId);
        }
        lastError = { status: result.status, error: result.error };
        if (result.status !== 409) break;
      }
      return json({ error: lastError?.error || "That time is no longer available" }, lastError?.status || 409);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[booking-public]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
