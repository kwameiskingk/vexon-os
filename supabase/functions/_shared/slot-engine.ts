// The slot engine, shared by booking-availability (signed-in staff) and
// booking-public (the /bookings/<slug> page). Weekly availability rules,
// minus Google free/busy (when available), minus our own held/confirmed
// bookings, minus buffer / minimum notice / daily cap.
//
// Hosts come in two kinds since the fulfilment build (24 Aug):
//  - staff:  rules + bookings keyed by host_user_id; free/busy via the
//    Workspace service account impersonating their company calendar.
//  - client: rules + bookings keyed by client_profile_id; free/busy via the
//    client's OAuth connection when they've connected (Tier 2) — otherwise
//    rules-only (Tier 1), reported as calendar_checked=false so callers can
//    surface "working hours only".

// deno-lint-ignore-file no-explicit-any
import {
  getAccessToken, getBusyTimes, getClientCalendarAccess, zonedTimeToUtc, listHostCalendarEvents,
} from "./google-calendar.ts";
import { getMsBusyTimes } from "./microsoft-calendar.ts";
import { CALLBACK_MINUTES } from "./callback.ts";

type Interval = { start: number; end: number };
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

export type HostRef = {
  hostUserId?: string | null;
  clientProfileId?: string | null;
  /** Staff hosts: the DWD calendar email. Ignored for client hosts. */
  calendarEmail?: string | null;
};

/** Move appointment (12 Oct 2026): the booking being moved must not block
 * its own new slot, neither as a bookings row nor as the calendar entry it
 * already holds. */
export type IgnoreBooking = { bookingId: string; startsAt: string; endsAt: string };

export type SlotResult = {
  slots: Array<{ starts_at: string; ends_at: string }>;
  calendar_checked: boolean;
  reason?: string;
};

/** Throws on Google API failure (callers must NOT show busy time as free). */
export async function computeSlots(
  supabase: any,
  eventType: {
    id: string; duration_minutes: number; booking_horizon_days?: number | null;
    host_calendar_slots?: string | null; slot_capacity?: number | null;
  },
  hostRef: HostRef,
  opts: {
    fromDate?: string; days?: number; ignore?: IgnoreBooking;
    /** Callbacks (16 Oct 2026): 15-minute slots on exactly these UK dates,
     * on the client's hours, with the callback notice instead of the
     * hours' own notice. Buffer, daily cap, bookings and calendar busy time
     * apply as usual. */
    callback?: { dayKeys: string[]; noticeMinutes: number };
  } = {}
): Promise<SlotResult> {
  const isClient = !!hostRef.clientProfileId;
  // 23 Sep 2026: the host keeps the slots on her own calendar (Elena's
  // Trial Day entries). Offer exactly those entries, minus the ones already
  // full, and skip the free/busy pass — the entry being there IS the slot.
  if (eventType.host_calendar_slots && !isClient && !opts.callback) {
    return computeHostCalendarSlots(supabase, eventType, hostRef, opts);
  }
  // NULL event_type_id = the host's default weekly hours; rows scoped to this
  // event are overrides that replace the defaults outright (no merging).
  let rulesQuery = supabase
    .from("booking_availability_rules")
    .select("*")
    .or(`event_type_id.is.null,event_type_id.eq.${eventType.id}`);
  rulesQuery = isClient
    ? rulesQuery.eq("client_profile_id", hostRef.clientProfileId)
    : rulesQuery.eq("host_user_id", hostRef.hostUserId);
  const { data: allRules } = await rulesQuery;
  const overrides = (allRules || []).filter((r: any) => r.event_type_id === eventType.id);
  const rules = overrides.length > 0
    ? overrides
    : (allRules || []).filter((r: any) => r.event_type_id == null);
  if (rules.length === 0) {
    return { slots: [], calendar_checked: false, reason: "no_availability_rules" };
  }

  const durationMs = (opts.callback ? CALLBACK_MINUTES : eventType.duration_minutes) * 60_000;
  // 2 Oct (Marcus, onboarding call): candidates used to step by the event's
  // own duration, so a 60-minute call only ever tried on the hour and one
  // half-hour meeting killed two hours. Step every 30 minutes (or the
  // duration when shorter) so the slots mirror the calendar.
  const stepMs = Math.min(durationMs, 30 * 60_000);
  const now = Date.now();
  const startDate = opts.fromDate ? new Date(`${opts.fromDate}T00:00:00Z`) : new Date();
  // 17 Sep (Marcus): per-event horizon — follow-ups can be booked months out.
  // NULL keeps the original 31-day window; the engine never exceeds a year.
  // 2 Oct (Marcus): a client's booking page defaults to 7 days ahead.
  // 7 Oct (the owner, Daniel's ask for Ridgeway Legal): a client event's own
  // "books up to N days" setting is honoured; 7 applies only when it's unset.
  // Keep in step with horizonDays() in booking-public.
  const fallback = isClient ? 7 : 31;
  const horizon = Math.min(Math.max(Number(eventType.booking_horizon_days) || fallback, 1), 365);
  const rangeDays = Math.min(Math.max(Number(opts.days) || 14, 1), horizon);

  // 1. Candidate slots from the weekly rules, computed in the host's timezone.
  const dayKeys: string[] = opts.callback
    ? opts.callback.dayKeys
    : Array.from({ length: rangeDays }, (_, d) => new Date(startDate.getTime() + d * 86_400_000).toISOString().slice(0, 10));
  const candidates: Array<{ start: number; end: number; dayKey: string }> = [];
  for (const dayKey of dayKeys) {
    const weekday = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
    for (const rule of rules) {
      if (rule.weekday !== weekday) continue;
      const windowStart = zonedTimeToUtc(dayKey, rule.start_time.slice(0, 5), rule.timezone).getTime();
      const windowEnd = zonedTimeToUtc(dayKey, rule.end_time.slice(0, 5), rule.timezone).getTime();
      const minNoticeMs = (opts.callback ? opts.callback.noticeMinutes : (rule.min_notice_minutes || 0)) * 60_000;
      for (let t = windowStart; t + durationMs <= windowEnd; t += stepMs) {
        if (t < now + minNoticeMs) continue;
        candidates.push({ start: t, end: t + durationMs, dayKey });
      }
    }
  }
  if (candidates.length === 0) return { slots: [], calendar_checked: false };

  const bufferMs = Math.max(...rules.map((r: any) => r.buffer_minutes || 0)) * 60_000;
  const dailyCap = rules.find((r: any) => r.daily_cap != null)?.daily_cap ?? null;
  const rangeMin = new Date(Math.min(...candidates.map((c) => c.start)) - 86_400_000).toISOString();
  const rangeMax = new Date(Math.max(...candidates.map((c) => c.end)) + 86_400_000).toISOString();

  // 2. Blocks from our own held/confirmed bookings (buffer-expanded).
  let bookedQuery = supabase
    .from("bookings")
    .select("starts_at, ends_at")
    .in("status", ["held", "confirmed"])
    .gte("starts_at", rangeMin)
    .lte("starts_at", rangeMax);
  bookedQuery = isClient
    ? bookedQuery.eq("client_profile_id", hostRef.clientProfileId)
    : bookedQuery.eq("host_user_id", hostRef.hostUserId);
  if (opts.ignore) bookedQuery = bookedQuery.neq("id", opts.ignore.bookingId);
  const { data: existing } = await bookedQuery;
  const blocks: Interval[] = (existing || []).map((b: any) => ({
    start: new Date(b.starts_at).getTime() - bufferMs,
    end: new Date(b.ends_at).getTime() + bufferMs,
  }));
  const perDayCount: Record<string, number> = {};
  for (const b of existing || []) {
    const k = b.starts_at.slice(0, 10);
    perDayCount[k] = (perDayCount[k] || 0) + 1;
  }

  // 3. Blocks from calendar free/busy. Staff: Workspace service account
  // (Google). Client: their OAuth connection when connected — Google or
  // Microsoft, whichever they linked; otherwise Tier 1 — rules-only,
  // honestly reported via calendar_checked=false.
  // An API *failure* propagates so callers return an error instead.
  let calendarChecked = false;
  let busySource: { token: string; email: string; provider: "google" | "microsoft" } | null = null;
  if (isClient) {
    const access = await getClientCalendarAccess(supabase, hostRef.clientProfileId!);
    if (access) busySource = { token: access.token, email: access.calendarEmail, provider: access.provider };
  } else if (hostRef.calendarEmail) {
    const token = await getAccessToken(hostRef.calendarEmail);
    if (token) busySource = { token, email: hostRef.calendarEmail, provider: "google" };
  }
  if (busySource) {
    // 21 Sep (Tom): Google freeBusy and Graph getSchedule both reject long
    // windows (a 180-day horizon came back 502 and the page went blank), so
    // walk the range in 60-day chunks and merge. Failures still propagate.
    const CHUNK_MS = 60 * 86_400_000;
    const busy: Array<{ start: string; end: string }> = [];
    const rangeMaxMs = new Date(rangeMax).getTime();
    for (let from = new Date(rangeMin).getTime(); from < rangeMaxMs; from += CHUNK_MS) {
      const to = Math.min(from + CHUNK_MS, rangeMaxMs);
      const fromIso = new Date(from).toISOString();
      const toIso = new Date(to).toISOString();
      const part = busySource.provider === "microsoft"
        ? await getMsBusyTimes(busySource.token, busySource.email, fromIso, toIso)
        : await getBusyTimes(busySource.token, busySource.email, fromIso, toIso);
      busy.push(...part);
    }
    // The moved booking's own calendar entry is busy time we must not count:
    // cut that interval out of whatever free/busy returned around it.
    const ignored: Interval | null = opts.ignore
      ? { start: new Date(opts.ignore.startsAt).getTime(), end: new Date(opts.ignore.endsAt).getTime() }
      : null;
    for (const b of busy) {
      const raw: Interval = { start: new Date(b.start).getTime(), end: new Date(b.end).getTime() };
      const parts: Interval[] = ignored && overlaps(raw, ignored)
        ? [
            ...(raw.start < ignored.start ? [{ start: raw.start, end: ignored.start }] : []),
            ...(raw.end > ignored.end ? [{ start: ignored.end, end: raw.end }] : []),
          ]
        : [raw];
      for (const part of parts) {
        blocks.push({ start: part.start - bufferMs, end: part.end + bufferMs });
      }
    }
    calendarChecked = true;
  }

  // 4. Filter, sort, serialise.
  const slots = candidates
    .filter((c) => !blocks.some((b) => overlaps(c, b)))
    .filter((c) => dailyCap == null || (perDayCount[c.dayKey] || 0) < dailyCap)
    .sort((a, b) => a.start - b.start)
    .map((c) => ({
      starts_at: new Date(c.start).toISOString(),
      ends_at: new Date(c.end).toISOString(),
    }));

  return { slots, calendar_checked: calendarChecked };
}

/** Slots = the host's own calendar entries whose title contains
 * eventType.host_calendar_slots, within the horizon and past the minimum
 * notice, with fewer bookings than slot_capacity (NULL = no limit). */
async function computeHostCalendarSlots(
  supabase: any,
  eventType: {
    id: string; duration_minutes: number; booking_horizon_days?: number | null;
    host_calendar_slots?: string | null; slot_capacity?: number | null;
  },
  hostRef: HostRef,
  opts: { fromDate?: string; days?: number },
): Promise<SlotResult> {
  if (!hostRef.calendarEmail) {
    return { slots: [], calendar_checked: false, reason: "no_host_calendar" };
  }
  const token = await getAccessToken(hostRef.calendarEmail);
  if (!token) return { slots: [], calendar_checked: false, reason: "no_calendar_access" };

  const now = Date.now();
  const startDate = opts.fromDate ? new Date(`${opts.fromDate}T00:00:00Z`) : new Date();
  const horizon = Math.min(Math.max(Number(eventType.booking_horizon_days) || 31, 1), 365);
  const rangeDays = Math.min(Math.max(Number(opts.days) || 14, 1), horizon);
  const timeMin = new Date(Math.max(startDate.getTime(), now)).toISOString();
  const timeMax = new Date(startDate.getTime() + rangeDays * 86_400_000).toISOString();
  // Same notice the weekly rules carry for this host, else two hours.
  const { data: noticeRule } = await supabase
    .from("booking_availability_rules")
    .select("min_notice_minutes")
    .eq("host_user_id", hostRef.hostUserId)
    .or(`event_type_id.is.null,event_type_id.eq.${eventType.id}`)
    .limit(1)
    .maybeSingle();
  const minNoticeMs = (noticeRule?.min_notice_minutes ?? 120) * 60_000;

  const events = await listHostCalendarEvents(
    token, hostRef.calendarEmail, timeMin, timeMax, eventType.host_calendar_slots!,
  );

  const cap = eventType.slot_capacity;
  const perStart: Record<string, number> = {};
  if (cap != null) {
    const { data: taken } = await supabase
      .from("bookings")
      .select("starts_at")
      .eq("event_type_id", eventType.id)
      .in("status", ["held", "confirmed"])
      .gte("starts_at", timeMin)
      .lte("starts_at", timeMax);
    for (const b of taken || []) perStart[b.starts_at] = (perStart[b.starts_at] || 0) + 1;
  }

  const slots = events
    .filter((ev) => new Date(ev.startsAt).getTime() >= now + minNoticeMs)
    .filter((ev) => cap == null || (perStart[ev.startsAt] || 0) < cap)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((ev) => ({ starts_at: ev.startsAt, ends_at: ev.endsAt }));
  return { slots, calendar_checked: true };
}
