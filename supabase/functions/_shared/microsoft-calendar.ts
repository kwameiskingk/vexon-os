// Microsoft 365 (Outlook + Teams) access for the booking platform — the
// Microsoft twin of google-calendar.ts, built to the 25 Aug design:
//
//  - Multi-tenant Entra app; clients connect via delegated OAuth
//    (Calendars.ReadWrite + openid email offline_access). Tenants that block
//    user consent go through the admin-consent URL instead (booking-client-
//    connect owns that flow).
//  - Free/busy via POST /me/calendar/getSchedule.
//  - Event creation via POST /me/events with isOnlineMeeting=true and
//    onlineMeetingProvider=teamsForBusiness → Outlook emails the invites AND
//    mints a unique one-time Teams join link per booking (Calendly parity;
//    the static-room fallback stays for never-connected clients).
//
// Token storage: calendar_connections' google_refresh_token /
// google_access_token / token_expires_at columns are provider-opaque token
// stores — the provider column says which identity platform they belong to.
// (Named before Microsoft existed; reused rather than migrated.)

import { reportClientCalendarDisconnect } from "./calendar-health.ts";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
export const MS_ADMIN_CONSENT_URL = "https://login.microsoftonline.com/organizations/adminconsent";
const GRAPH = "https://graph.microsoft.com/v1.0";

export const MS_SCOPES = [
  "openid",
  "email",
  "offline_access",
  "https://graph.microsoft.com/Calendars.ReadWrite",
].join(" ");

// The the hosted builder secrets UI stores these lowercase; accept either casing.
export const msOauthClientId = () =>
  Deno.env.get("MICROSOFT_OAUTH_CLIENT_ID") || Deno.env.get("microsoft_oauth_client_id") || "";
export const msOauthClientSecret = () =>
  Deno.env.get("MICROSOFT_OAUTH_CLIENT_SECRET") || Deno.env.get("microsoft_oauth_client_secret") || "";

/** Authorization-code exchange (connect callback). */
export async function msExchangeCode(code: string, redirectUri: string): Promise<{
  refresh_token?: string;
  access_token?: string;
  expires_in?: number;
  id_token?: string;
} | null> {
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: msOauthClientId(),
      client_secret: msOauthClientSecret(),
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: MS_SCOPES,
    }),
  });
  if (!res.ok) {
    console.error("[microsoft-calendar] code exchange:", await res.text());
    return null;
  }
  return await res.json();
}

/** Refresh-token exchange for a connected client. Updates the row's cached
 * access token (and the rotated refresh token Microsoft may return); marks
 * the connection errored on a revoked grant so callers fall back to Tier 1. */
// deno-lint-ignore no-explicit-any
export async function refreshMicrosoftClientToken(supabase: any, conn: {
  id: string;
  google_refresh_token: string;
  client_profile_id?: string | null;
  status?: string | null;
  calendar_email?: string | null;
}): Promise<string | null> {
  const clientId = msOauthClientId();
  const clientSecret = msOauthClientSecret();
  if (!clientId || !clientSecret) return null;

  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: conn.google_refresh_token,
      scope: MS_SCOPES,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    await reportClientCalendarDisconnect(supabase, conn, `ms token refresh failed: ${errText.slice(0, 300)}`);
    console.error("[microsoft-calendar] client token refresh failed:", errText);
    return null;
  }
  const json = await res.json();
  const token = json.access_token as string;
  await supabase.from("calendar_connections")
    .update({
      google_access_token: token,
      // Microsoft rotates refresh tokens — keep the newest one alive.
      ...(json.refresh_token ? { google_refresh_token: json.refresh_token } : {}),
      token_expires_at: new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString(),
      last_checked_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", conn.id);
  return token;
}

/** Busy intervals for the connected mailbox between two instants.
 * busy/oof/tentative all count as blocked — never offer a slot Microsoft
 * shows as anything but free. Throws on API failure (mirrors getBusyTimes). */
export async function getMsBusyTimes(
  token: string, email: string, timeMin: string, timeMax: string
): Promise<Array<{ start: string; end: string }>> {
  const res = await fetch(`${GRAPH}/me/calendar/getSchedule`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      schedules: [email],
      startTime: { dateTime: timeMin, timeZone: "UTC" },
      endTime: { dateTime: timeMax, timeZone: "UTC" },
      availabilityViewInterval: 15,
    }),
  });
  if (!res.ok) {
    throw new Error(`getSchedule failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const items = json.value?.[0]?.scheduleItems || [];
  return items
    .filter((i: { status?: string }) => i.status !== "free" && i.status !== "workingElsewhere")
    .map((i: { start: { dateTime: string }; end: { dateTime: string } }) => ({
      // Graph returns naive UTC datetimes when asked for UTC — mark them so.
      start: `${i.start.dateTime}Z`.replace(/Z+$/, "Z"),
      end: `${i.end.dateTime}Z`.replace(/Z+$/, "Z"),
    }));
}

/** Creates the event on the connected client's own Outlook calendar. Outlook
 * emails the invites; with includeTeams a unique one-time Teams join link is
 * minted for this booking (the whole point of the Microsoft build). */
export async function createMsCalendarEvent(
  token: string,
  opts: {
    summary: string;
    description: string;
    startsAt: string;
    endsAt: string;
    attendeeEmails: string[];
    includeTeams: boolean;
    location?: string | null;
  }
): Promise<{ eventId: string; joinUrl: string | null }> {
  const body: Record<string, unknown> = {
    subject: opts.summary,
    body: { contentType: "text", content: opts.description },
    start: { dateTime: opts.startsAt, timeZone: "UTC" },
    end: { dateTime: opts.endsAt, timeZone: "UTC" },
    attendees: opts.attendeeEmails
      .filter((e, i, a) => e && a.indexOf(e) === i)
      .map((address) => ({ emailAddress: { address }, type: "required" })),
  };
  if (opts.location) body.location = { displayName: opts.location };
  if (opts.includeTeams) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = "teamsForBusiness";
  }

  const res = await fetch(`${GRAPH}/me/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`MS event insert failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  let joinUrl: string | null = json.onlineMeeting?.joinUrl || json.onlineMeetingUrl || null;

  // The Teams link is occasionally still being provisioned in the create
  // response — one short re-read almost always has it.
  if (opts.includeTeams && !joinUrl && json.id) {
    await new Promise((r) => setTimeout(r, 1500));
    const re = await fetch(
      `${GRAPH}/me/events/${encodeURIComponent(json.id)}?$select=onlineMeeting,onlineMeetingUrl`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (re.ok) {
      const rj = await re.json();
      joinUrl = rj.onlineMeeting?.joinUrl || rj.onlineMeetingUrl || null;
    }
  }
  return { eventId: json.id, joinUrl };
}

/** Cancels an event; Outlook emails the cancellation to attendees. */
export async function deleteMsCalendarEvent(token: string, eventId: string): Promise<void> {
  const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`MS event delete failed (${res.status}): ${await res.text()}`);
  }
}

/** Move an Outlook event in place (12 Oct 2026). Graph emails attendees the
 * update. Returns false when the event no longer exists. */
export async function moveMsCalendarEvent(token: string, eventId: string, startsAt: string, endsAt: string, description?: string): Promise<boolean> {
  const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      start: { dateTime: startsAt, timeZone: "UTC" }, end: { dateTime: endsAt, timeZone: "UTC" },
      // Replaces the event's description when given (a moved callback's backup times).
      ...(description !== undefined ? { body: { contentType: "text", content: description } } : {}),
    }),
  });
  if (res.status === 404 || res.status === 410) return false;
  if (!res.ok) throw new Error(`MS event patch failed (${res.status}): ${await res.text()}`);
  return true;
}
