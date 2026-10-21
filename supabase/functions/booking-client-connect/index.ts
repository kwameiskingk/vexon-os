// Client calendar connection — the CLIENT-facing half (verify_jwt = false).
// A client receives a branded email (sent by booking-client-admin) with a
// one-off connect link: /connect-calendar#ct=<token>. That page calls here:
//   - action "context":        token → client name + which providers are ready
//   - action "google_url":     token → the Google consent URL
//   - action "microsoft_url":  token → the Microsoft consent URL
//   - action "microsoft_admin_url": token → the tenant-wide admin-consent URL
//     (Calendars.ReadWrite is admin-consent-only in most tenants — the client
//     forwards this to their IT admin, who approves once for the whole org,
//     then the client re-runs the normal connect)
//   - GET ?code&state:         OAuth callback for BOTH providers — Google state
//     is the bare token, Microsoft state is "ms.<token>". Exchanges the code,
//     stores the refresh token on calendar_connections (provider column says
//     whose tokens they are), redirects back to /connect-calendar.
//   - GET ?admin_consent=…:    return leg of the Microsoft admin-consent flow.
// Scopes are the narrow set the engine needs (freebusy read + event write)
// plus openid email to learn which calendar was connected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { oauthClientId, oauthClientSecret } from "../_shared/google-calendar.ts";
import {
  MS_ADMIN_CONSENT_URL,
  MS_AUTH_URL,
  MS_SCOPES,
  msExchangeCode,
  msOauthClientId,
  msOauthClientSecret,
} from "../_shared/microsoft-calendar.ts";

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

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://vexon-os.example";
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

const redirectUri = () =>
  `${Deno.env.get("SUPABASE_URL")}/functions/v1/booking-client-connect`;

const clip = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max).trim() : "";

async function loadByToken(supabase: any, token: string) {
  if (!/^[a-f0-9]{32,64}$/.test(token)) return null;
  const { data } = await supabase
    .from("calendar_connections")
    .select("id, client_profile_id, status, connect_token")
    .eq("connect_token", token)
    .maybeSingle();
  return data || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── OAuth callbacks (GET redirects from the consent screens) ──
  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const rawState = url.searchParams.get("state") || "";
    const isMicrosoft = rawState.startsWith("ms.");
    const state = isMicrosoft ? rawState.slice(3) : rawState;
    const fail = (reason: string, extra = "") =>
      Response.redirect(
        `${APP_ORIGIN}/connect-calendar#error=${encodeURIComponent(reason)}${extra}`,
        302,
      );

    // Return leg of the Microsoft ADMIN-consent flow: no code, just a verdict.
    const adminConsent = url.searchParams.get("admin_consent");
    if (adminConsent !== null) {
      if (adminConsent.toLowerCase() === "true") {
        return Response.redirect(
          `${APP_ORIGIN}/connect-calendar#admin_done=1&ct=${encodeURIComponent(state)}`,
          302,
        );
      }
      return fail("Your IT admin declined the approval — talk to them, then try again");
    }

    try {
      if (!code) {
        // Microsoft tenants that block user consent bounce back here with a
        // consent error (AADSTS65001/90094 territory) — that's not a failure,
        // it's the signal to route through the IT admin.
        const err = url.searchParams.get("error") || "cancelled";
        const desc = url.searchParams.get("error_description") || "";
        if (isMicrosoft && /AADSTS65001|AADSTS90094|consent/i.test(`${err} ${desc}`)) {
          return fail("admin_consent_needed", `&ct=${encodeURIComponent(state)}`);
        }
        return fail(err);
      }
      const conn = await loadByToken(supabase, state);
      if (!conn) return fail("This connect link is no longer valid");

      if (isMicrosoft) {
        if (!msOauthClientId() || !msOauthClientSecret()) {
          return fail("Microsoft connection is not configured yet");
        }
        const tokens = await msExchangeCode(code, redirectUri());
        if (!tokens) return fail("Microsoft sign-in failed — try the link again");
        if (!tokens.refresh_token) return fail("Microsoft didn't grant offline access — try again");
        // The connected mailbox travels in the id_token payload.
        let msEmail: string | null = null;
        try {
          const payload = JSON.parse(atob(
            String(tokens.id_token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
          ));
          msEmail = payload.email || payload.preferred_username || null;
        } catch { /* email stays null; getSchedule still works via /me */ }

        await supabase.from("calendar_connections")
          .update({
            provider: "microsoft",
            status: "connected",
            calendar_email: msEmail || "primary",
            // Provider-opaque token columns (named before Microsoft existed).
            google_refresh_token: tokens.refresh_token,
            google_access_token: tokens.access_token || null,
            token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
            connected_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", conn.id);
        return Response.redirect(`${APP_ORIGIN}/connect-calendar#done=1`, 302);
      }

      const clientId = oauthClientId();
      const clientSecret = oauthClientSecret();
      if (!clientId || !clientSecret) return fail("Connection is not configured yet");

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri(), grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) {
        console.error("[client-connect] token exchange:", await tokenRes.text());
        return fail("Google sign-in failed — try the link again");
      }
      const tokens = await tokenRes.json();
      if (!tokens.refresh_token) {
        // prompt=consent + access_type=offline should always yield one.
        return fail("Google didn't grant offline access — try again");
      }
      // Google's consent screen shows our two scopes as separate tick boxes,
      // and a cautious client can untick either one and still complete the
      // flow. Without this check the connection goes green, the prospect picks
      // a time, and only then does the write fail — on the client's side, in
      // front of them. Refuse the half-grant instead; status stays "invited"
      // so the same link works on a second attempt.
      const granted = new Set(String(tokens.scope || "").split(/\s+/).filter(Boolean));
      const missing = ["https://www.googleapis.com/auth/calendar.events",
                       "https://www.googleapis.com/auth/calendar.freebusy"]
        .filter((s) => !granted.has(s));
      if (missing.length) {
        console.error("[client-connect] partial grant", { conn: conn.id, granted: [...granted] });
        return fail("Please tick both calendar permissions — we need to see when you're free and add the meetings we book. Open the link again and leave both boxes checked.");
      }
      // The connected account's email travels in the id_token payload.
      let email: string | null = null;
      try {
        const payload = JSON.parse(atob(
          String(tokens.id_token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
        ));
        email = payload.email || null;
      } catch { /* email stays null; connection still works via 'primary' */ }

      await supabase.from("calendar_connections")
        .update({
          provider: "google",
          status: "connected",
          calendar_email: email || "primary",
          google_refresh_token: tokens.refresh_token,
          google_access_token: tokens.access_token || null,
          token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
          connected_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", conn.id);
      return Response.redirect(`${APP_ORIGIN}/connect-calendar#done=1`, 302);
    } catch (e) {
      console.error("[client-connect] callback:", e);
      return fail("Something went wrong — try the link again");
    }
  }

  // ── JSON actions from the /connect-calendar page ──
  try {
    const body = await req.json();
    const action = body.action;
    const token = clip(body.ct, 64);
    const conn = await loadByToken(supabase, token);
    if (!conn) return json({ error: "This connect link is no longer valid — ask for a new one" }, 404);

    const { data: client } = await supabase
      .from("client_profiles").select("company_name")
      .eq("id", conn.client_profile_id).maybeSingle();

    if (action === "context") {
      return json({
        client_name: client?.company_name || "your company",
        already_connected: conn.status === "connected",
        google_ready: !!(oauthClientId() && oauthClientSecret()),
        microsoft_ready: !!(msOauthClientId() && msOauthClientSecret()),
      });
    }

    if (action === "google_url") {
      const clientId = oauthClientId();
      if (!clientId) return json({ error: "Google connection isn't configured yet" }, 503);
      const url =
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri(),
          response_type: "code",
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
          state: token,
        }).toString();
      return json({ url });
    }

    if (action === "microsoft_url") {
      const clientId = msOauthClientId();
      if (!clientId) return json({ error: "Microsoft connection isn't configured yet" }, 503);
      const url =
        `${MS_AUTH_URL}?` +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri(),
          response_type: "code",
          response_mode: "query",
          scope: MS_SCOPES,
          prompt: "select_account",
          state: `ms.${token}`,
        }).toString();
      return json({ url });
    }

    if (action === "microsoft_admin_url") {
      const clientId = msOauthClientId();
      if (!clientId) return json({ error: "Microsoft connection isn't configured yet" }, 503);
      const url =
        `${MS_ADMIN_CONSENT_URL}?` +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri(),
          state: `ms.${token}`,
        }).toString();
      return json({ url });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[client-connect]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
