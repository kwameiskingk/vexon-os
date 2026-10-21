// Google Calendar access for the booking platform, via a Workspace service
// account with domain-wide delegation (scope: auth/calendar, authorised in the
// Google Admin console). We impersonate the host's own company email, so
// free/busy reads and event creation happen on their real primary calendar and
// Google itself emails the invite to the prospect (sendUpdates=all).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar";

type ServiceAccount = { client_email: string; private_key: string };

const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = atob(
    pem.replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\s/g, "")
  );
  const bytes = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) bytes[i] = der.charCodeAt(i);
  return crypto.subtle.importKey(
    "pkcs8", bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
}

/** Access token impersonating `hostEmail`. Returns null when the Google secret
 * isn't configured yet, so callers can degrade gracefully during setup. */
export async function getAccessToken(hostEmail: string): Promise<string | null> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  const sa: ServiceAccount = JSON.parse(raw);
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    sub: hostEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600,
  }));
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)
  );
  const jwt = `${header}.${claims}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

/** Busy intervals for the host between two instants. */
export async function getBusyTimes(
  token: string, hostEmail: string, timeMin: string, timeMax: string
): Promise<Array<{ start: string; end: string }>> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: hostEmail }] }),
  });
  if (!res.ok) {
    throw new Error(`freeBusy failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.calendars?.[hostEmail]?.busy || [];
}

/** Creates the event on the host's calendar with the prospect as attendee.
 * Google sends the official invite email; a Meet link is attached. */
export async function createCalendarEvent(
  token: string,
  hostEmail: string,
  opts: {
    summary: string;
    description: string;
    startsAt: string;
    endsAt: string;
    attendeeEmail?: string | null;
    /** Additional attendees (client events: the client, a decision maker). */
    attendeeEmails?: string[] | null;
    requestId: string;
    /** false for phone/in-person events — plain calendar entry, no Meet */
    includeMeet?: boolean;
    /** Where the meeting happens — a Teams/Zoom room URL for clients whose
     * conferencing Google cannot mint, or a phone note. Shows in the invite. */
    location?: string | null;
  }
): Promise<{ eventId: string; meetLink: string | null }> {
  const body: Record<string, unknown> = {
    summary: opts.summary,
    description: opts.description,
    start: { dateTime: opts.startsAt, timeZone: "UTC" },
    end: { dateTime: opts.endsAt, timeZone: "UTC" },
  };
  if (opts.location) body.location = opts.location;
  if (opts.includeMeet !== false) {
    body.conferenceData = {
      createRequest: {
        requestId: opts.requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  const attendees = [
    ...(opts.attendeeEmail ? [opts.attendeeEmail] : []),
    ...(opts.attendeeEmails || []),
  ].filter((e, i, a) => e && a.indexOf(e) === i);
  if (attendees.length > 0) body.attendees = attendees.map((email) => ({ email }));

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(hostEmail)}` +
      `/events?sendUpdates=all&conferenceDataVersion=1`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(`Event insert failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  // 9 Oct 2026 (Harvey Stone, booked 7 Oct by Tom): Google answered the insert
  // with the event but no Meet link yet — the conference request was still
  // "pending", so the booking, the SMS/email reminders and Marcus's diary
  // all went out without a link (2 of ~46 Meet bookings in three weeks).
  // Wait for the link to appear before treating it as missing.
  const meetLink = opts.includeMeet !== false
    ? await ensureMeetLink(token, hostEmail, json.id, json)
    : eventMeetLink(json);
  return { eventId: json.id, meetLink };
}

/* ── Meet-link readiness (9 Oct 2026) ──────────────────────────────────────
 * Google's conference creation is asynchronous: an insert/patch that asks for
 * a Meet can return with conferenceData.createRequest.status.statusCode
 * "pending" and no hangoutLink. Usually it's ready within a second or two.
 * ensureMeetLink polls the event until the link exists; if Google reports
 * "failure" it asks again with a fresh requestId. repairMeetLink is the same
 * thing for an event created earlier (the reminder cron's safety net). */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getEvent(token: string, hostEmail: string, eventId: string): Promise<any> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(hostEmail)}/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`events.get failed (${res.status}): ${await res.text()}`);
  return await res.json();
}

/** Asks Google to attach a Meet to an existing event. sendUpdates=all so every
 * guest receives the updated invite carrying the link. */
async function requestMeet(token: string, hostEmail: string, eventId: string): Promise<any> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(hostEmail)}/events/${encodeURIComponent(eventId)}?sendUpdates=all&conferenceDataVersion=1`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        conferenceData: {
          createRequest: {
            requestId: `${eventId}-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`events.patch (request Meet) failed (${res.status}): ${await res.text()}`);
  return await res.json();
}

const conferenceStatus = (json: any): string | null =>
  json?.conferenceData?.createRequest?.status?.statusCode || null;

/** Returns the Meet link for a just-created/edited event, polling while Google
 * is still minting it. Re-requests once on "failure". Null only after ~8 s of
 * nothing — the caller then logs it and the repair sweep picks it up later. */
export async function ensureMeetLink(
  token: string, hostEmail: string, eventId: string, initial: any
): Promise<string | null> {
  let json = initial;
  let reissued = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const link = eventMeetLink(json);
    if (link) return link;
    const status = conferenceStatus(json);
    if ((status === "failure" || status === null) && !reissued) {
      // Google gave up (or never registered the request): ask once more.
      reissued = true;
      console.warn(`[google-calendar] Meet ${status ?? "absent"} on ${eventId} — re-requesting`);
      json = await requestMeet(token, hostEmail, eventId);
      continue;
    }
    await sleep(1500);
    json = await getEvent(token, hostEmail, eventId);
  }
  console.error(`[google-calendar] no Meet link on ${eventId} after polling (status ${conferenceStatus(json)})`);
  return null;
}

/** Safety net for a booking whose event exists but never got its link: reads
 * the event, returns the link if it is there now (e.g. added by hand), else
 * asks Google for one and waits for it. */
export async function repairMeetLink(
  token: string, hostEmail: string, eventId: string
): Promise<string | null> {
  const ev = await getEvent(token, hostEmail, eventId);
  if (ev.status === "cancelled") return null;
  const existing = eventMeetLink(ev);
  if (existing) return existing;
  const requested = await requestMeet(token, hostEmail, eventId);
  return await ensureMeetLink(token, hostEmail, eventId, requested);
}

/* ── Host-calendar slots (23 Sep 2026, the owner + Elena) ─────────────────────
 * Some events are not "find a free gap": the host already keeps the slots on
 * her own calendar (Elena's Trial Day entries, Tue/Wed/Fri 11:00 SAST) and a
 * booking means adding the candidate as a guest to THAT entry — her Meet
 * link, her time, several candidates per entry. These helpers read those
 * entries and edit their guest lists. Recurring series are expanded to
 * instances, so an edit touches one day only. */

export type HostCalendarEvent = {
  id: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  attendees: string[];
  meetLink: string | null;
};

function eventMeetLink(json: any): string | null {
  return (
    json.hangoutLink ||
    json.conferenceData?.entryPoints?.find((e: { entryPointType: string }) =>
      e.entryPointType === "video")?.uri ||
    null
  );
}

/** Timed events on the host's calendar in [timeMin, timeMax) whose title
 * contains `titleMatch` (case-insensitive). All-day and cancelled entries are
 * left out. */
export async function listHostCalendarEvents(
  token: string, hostEmail: string, timeMin: string, timeMax: string, titleMatch: string
): Promise<HostCalendarEvent[]> {
  const out: HostCalendarEvent[] = [];
  const needle = titleMatch.trim().toLowerCase();
  let pageToken: string | null = null;
  do {
    const params = new URLSearchParams({
      timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250",
      q: titleMatch.trim(),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(hostEmail)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      throw new Error(`events.list failed (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    for (const ev of json.items || []) {
      if (ev.status === "cancelled") continue;
      if (!ev.start?.dateTime || !ev.end?.dateTime) continue; // all-day
      if (!String(ev.summary || "").toLowerCase().includes(needle)) continue;
      out.push({
        id: ev.id,
        summary: ev.summary || "",
        startsAt: new Date(ev.start.dateTime).toISOString(),
        endsAt: new Date(ev.end.dateTime).toISOString(),
        attendees: (ev.attendees || []).map((a: any) => String(a.email || "").toLowerCase()).filter(Boolean),
        meetLink: eventMeetLink(ev),
      });
    }
    pageToken = json.nextPageToken || null;
  } while (pageToken);
  return out;
}

/** Adds guests to an existing event (existing guests kept). Google emails the
 * invite to the new guests only. */
export async function addHostCalendarGuests(
  token: string, hostEmail: string, eventId: string, emails: string[]
): Promise<{ meetLink: string | null }> {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(hostEmail)}/events/${encodeURIComponent(eventId)}`;
  const cur = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  if (!cur.ok) throw new Error(`events.get failed (${cur.status}): ${await cur.text()}`);
  const ev = await cur.json();
  const have = new Set((ev.attendees || []).map((a: any) => String(a.email || "").toLowerCase()));
  const attendees = [...(ev.attendees || [])];
  for (const e of emails) {
    const email = e.trim().toLowerCase();
    if (email && !have.has(email)) { attendees.push({ email }); have.add(email); }
  }
  // 23 Sep (Elena): the candidate must get a Meet link with the invite. If
  // her entry has none, the same edit that adds the guest asks Google to mint
  // one on this instance, so the invite Google sends carries the link.
  const body: Record<string, unknown> = { attendees };
  if (!eventMeetLink(ev)) {
    body.conferenceData = {
      createRequest: { requestId: `${eventId}-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } },
    };
  }
  const res = await fetch(`${base}?sendUpdates=all&conferenceDataVersion=1`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`events.patch (add guests) failed (${res.status}): ${await res.text()}`);
  // 9 Oct: a freshly requested Meet may still be "pending" in this response.
  return { meetLink: await ensureMeetLink(token, hostEmail, eventId, await res.json()) };
}

/** Removes one guest from an existing event; the event itself stays. */
export async function removeHostCalendarGuest(
  token: string, hostEmail: string, eventId: string, email: string
): Promise<void> {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(hostEmail)}/events/${encodeURIComponent(eventId)}`;
  const cur = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  if (cur.status === 404 || cur.status === 410) return;
  if (!cur.ok) throw new Error(`events.get failed (${cur.status}): ${await cur.text()}`);
  const ev = await cur.json();
  const target = email.trim().toLowerCase();
  const attendees = (ev.attendees || []).filter((a: any) => String(a.email || "").toLowerCase() !== target);
  if (attendees.length === (ev.attendees || []).length) return;
  const res = await fetch(`${base}?sendUpdates=all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ attendees }),
  });
  if (!res.ok) throw new Error(`events.patch (remove guest) failed (${res.status}): ${await res.text()}`);
}

/** Cancels an event (used by rebook/cancel flows). sendUpdates notifies attendees. */
export async function deleteCalendarEvent(
  token: string, hostEmail: string, eventId: string
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(hostEmail)}` +
      `/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Event delete failed (${res.status}): ${await res.text()}`);
  }
}

/* ── Client calendar connections (Tier 2 — per-client OAuth) ───────────────
 * A connected client authorised us via their provider's consent screen; we
 * hold the refresh token in calendar_connections (the google_* token columns
 * are provider-opaque stores — the provider column says whose tokens they
 * are). These helpers exchange it for a live access token (cached on the row
 * until ~expiry). Absent OAuth env or connection, callers fall back to
 * Tier 1 (Meridian calendar + email invites). */

import { refreshMicrosoftClientToken, msOauthClientId, msOauthClientSecret } from "./microsoft-calendar.ts";
import { reportClientCalendarDisconnect } from "./calendar-health.ts";

// The the hosted builder secrets UI stores these lowercase; accept either casing.
export const oauthClientId = () =>
  Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || Deno.env.get("google_oauth_client_id") || "";
export const oauthClientSecret = () =>
  Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || Deno.env.get("google_oauth_client_secret") || "";

export type CalendarProvider = "google" | "microsoft";
export type ClientCalendarAccess = {
  token: string;
  calendarEmail: string;
  provider: CalendarProvider;
};

// deno-lint-ignore no-explicit-any
export async function getClientCalendarAccess(
  supabase: any, clientProfileId: string, opts: { forceRefresh?: boolean } = {}
): Promise<ClientCalendarAccess | null> {
  const { data: conn } = await supabase
    .from("calendar_connections")
    .select("id, client_profile_id, provider, calendar_email, status, google_refresh_token, google_access_token, token_expires_at")
    .eq("client_profile_id", clientProfileId)
    .eq("status", "connected")
    .maybeSingle();
  if (!conn?.google_refresh_token || !conn.calendar_email) return null;
  const provider: CalendarProvider = conn.provider === "microsoft" ? "microsoft" : "google";

  // Cached token still comfortably valid? (Both providers share the cache.)
  // The hourly probe passes forceRefresh so a revoked grant is caught even
  // while a cached token would still have satisfied us.
  if (
    !opts.forceRefresh &&
    conn.google_access_token && conn.token_expires_at &&
    new Date(conn.token_expires_at).getTime() > Date.now() + 120_000
  ) {
    return { token: conn.google_access_token, calendarEmail: conn.calendar_email, provider };
  }

  if (provider === "microsoft") {
    if (!msOauthClientId() || !msOauthClientSecret()) return null;
    const token = await refreshMicrosoftClientToken(supabase, conn);
    return token ? { token, calendarEmail: conn.calendar_email, provider } : null;
  }

  const clientId = oauthClientId();
  const clientSecret = oauthClientSecret();
  if (!clientId || !clientSecret) return null;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.google_refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    // Revoked or expired grant: surface on the connection, tell the CSM and
    // the client (11 Sep), fall back to Tier 1.
    const errText = await res.text();
    await reportClientCalendarDisconnect(supabase, conn, `token refresh failed: ${errText.slice(0, 300)}`);
    console.error("[google-calendar] client token refresh failed:", errText);
    return null;
  }
  const json = await res.json();
  const token = json.access_token as string;
  await supabase.from("calendar_connections")
    .update({
      google_access_token: token,
      token_expires_at: new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString(),
      last_checked_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", conn.id);
  return { token, calendarEmail: conn.calendar_email, provider };
}

/** Converts a wall-clock date+time in an IANA timezone to a UTC Date.
 * The standard two-pass Intl trick; exact across DST for real-world inputs. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const naive = new Date(`${date}T${time}:00Z`);
  const wallInTz = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(d).reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
    return Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour === "24" ? "00" : parts.hour), Number(parts.minute), Number(parts.second)
    );
  };
  const offset = wallInTz(naive) - naive.getTime();
  const guess = new Date(naive.getTime() - offset);
  // second pass corrects a guess that crossed a DST boundary
  const offset2 = wallInTz(guess) - guess.getTime();
  return offset2 === offset ? guess : new Date(naive.getTime() - offset2);
}

/** Formats a UTC instant as {date, time} wall-clock strings in a timezone —
 * used to fill meetings.meeting_date/meeting_time (business-local). */
export function utcToZonedParts(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso)).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
  };
}

/** Move an event in place (12 Oct 2026, Move appointment): same event id,
 * same attendees, same Meet link; Google emails everyone the new time.
 * Returns null when the event no longer exists on that calendar. */
export async function moveCalendarEvent(
  token: string,
  hostEmail: string,
  eventId: string,
  startsAt: string,
  endsAt: string,
  /** Replaces the event's description when given (a moved callback's backup times). */
  description?: string,
): Promise<{ meetLink: string | null } | null> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(hostEmail)}/events/${encodeURIComponent(eventId)}?sendUpdates=all&conferenceDataVersion=1`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        start: { dateTime: startsAt, timeZone: "UTC" }, end: { dateTime: endsAt, timeZone: "UTC" },
        ...(description !== undefined ? { description } : {}),
      }),
    },
  );
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`Event patch failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return {
    meetLink: json.hangoutLink ||
      json.conferenceData?.entryPoints?.find((e: { entryPointType: string }) => e.entryPointType === "video")?.uri || null,
  };
}
