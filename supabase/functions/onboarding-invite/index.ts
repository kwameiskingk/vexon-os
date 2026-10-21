// Onboarding invite email — replaces the copy-paste temp-credentials
// handover. Called by the TA flow right after create-user provisions the
// starter's account: generates a one-shot recovery token for the COMPANY
// email (the account create-user made with email_confirm:true — recovery is
// the link type that works for an existing confirmed user) and emails a
// branded "your Vexon OS account is ready" invite whose button lands on the
// public /welcome set-password page.
//
// 11 Sep (Marcus, 8 Sep): the invite goes to the COMPANY mailbox — the new
// Google Workspace address Elena created — so the onboarding is the first
// email they ever receive there. personal_email is accepted but unused.
//
// The token travels in the URL FRAGMENT (#token_hash=…) so it never appears
// in server access logs, and it is never logged here. If the email can't be
// sent, the caller falls back to showing the temp credentials as before —
// this function failing is survivable, the account already exists.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { sendResendEmail } from "../_shared/booking-flow.ts";

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

// Staff roles that may send invites; TAs without a role row are covered by
// the can_screen_candidates capability fallback (same gate create-user's
// onboarding path uses).
const STAFF_ROLES = ["dev", "admin", "ops", "hr"];

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://vexon-os.example";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function inviteEmailHtml(opts: {
  fullName: string;
  companyEmail: string;
  inviteUrl: string;
}) {
  const firstName = escapeHtml((opts.fullName || "").trim().split(/\s+/)[0] || "there");
  const companyEmail = escapeHtml(opts.companyEmail);
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background-color:#9e9e9e;background:linear-gradient(135deg,#dedede 0%,#9e9e9e 50%,#6b7a90 100%);border-radius:16px;padding:28px 30px;color:#0f0f11;">
      <img src="https://vexon-os.example/brand/vexon-logo-white.png" width="120" alt="Vexon OS" style="display:block;width:120px;height:auto;border:0;" />
      <h1 style="margin:8px 0 0;font-size:22px;">Your Vexon OS account is ready ✓</h1>
    </div>
    <div style="background:#ffffff;border:1px solid #e3e3e6;border-radius:16px;padding:26px 30px;margin-top:16px;color:#111113;">
      <p style="margin:0 0 14px;">Hi ${firstName},</p>
      <p style="margin:0 0 14px;">Welcome aboard, and welcome to your new mailbox. We've set up your Vexon OS account for your onboarding. You'll sign in with this address:</p>
      <p style="margin:0 0 18px;font-size:18px;font-weight:700;color:#2f4661;">${companyEmail}</p>
      <p style="margin:0 0 10px;"><a href="${opts.inviteUrl}" style="display:inline-block;background:#3d5a80;background:linear-gradient(90deg,#3d5a80,#5a5a5a);color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 26px;font-weight:700;">Set your password →</a></p>
      <p style="margin:0;color:#5f5f66;font-size:13px;">This link is personal to you and expires after a short while. If it stops working, just ask your onboarding contact to resend the invite.</p>
    </div>
    <p style="text-align:center;color:#5f5f66;font-size:11px;margin-top:14px;">Powered by Vexon OS</p>
  </div></body></html>`;
}

function trialInviteEmailHtml(opts: { fullName: string; email: string; inviteUrl: string }) {
  const firstName = escapeHtml((opts.fullName || "").trim().split(/\s+/)[0] || "there");
  const email = escapeHtml(opts.email);
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background-color:#9e9e9e;background:linear-gradient(135deg,#dedede 0%,#9e9e9e 50%,#6b7a90 100%);border-radius:16px;padding:28px 30px;color:#0f0f11;">
      <p style="margin:0;font-size:12px;letter-spacing:2px;opacity:.85;">VEXON · TRIAL DAY</p>
      <h1 style="margin:8px 0 0;font-size:22px;">Your trial-day login is ready</h1>
    </div>
    <div style="background:#ffffff;border:1px solid #e3e3e6;border-radius:16px;padding:26px 30px;margin-top:16px;color:#111113;">
      <p style="margin:0 0 14px;">Hi ${firstName},</p>
      <p style="margin:0 0 14px;">On your trial day you will log every meeting-ready lead in Vexon OS. It is one button, and it walks you through the questions. Set your password now so you are ready on the morning. You will sign in with:</p>
      <p style="margin:0 0 18px;font-size:18px;font-weight:700;color:#2f4661;">${email}</p>
      <p style="margin:0 0 10px;"><a href="${opts.inviteUrl}" style="display:inline-block;background:#3d5a80;background:linear-gradient(90deg,#3d5a80,#5a5a5a);color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 26px;font-weight:700;">Set your password →</a></p>
      <p style="margin:0;color:#5f5f66;font-size:13px;">This link is personal to you and expires after a short while. If it stops working, ask Elena to resend it.</p>
    </div>
    <p style="text-align:center;color:#5f5f66;font-size:11px;margin-top:14px;">Powered by Vexon OS</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { company_email, full_name, trial } = await req.json();
    const isTrial = trial === true;
    if (typeof company_email !== "string" || !company_email.includes("@")) {
      return json({ error: "company_email is required" }, 400);
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

    // Multi-role-safe gate: fetch the caller's matching staff roles, allow
    // on any hit. TAs may instead hold the screening capability.
    const { data: staffRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", STAFF_ROLES);
    if (roleError) return json({ error: "Could not verify permissions" }, 500);

    let allowed = (staffRows ?? []).length > 0;
    if (!allowed) {
      const { data: capData } = await supabase.rpc("has_capability", {
        _user_id: user.id,
        _cap: "can_screen_candidates",
      });
      allowed = capData === true;
    }
    if (!allowed) return json({ error: "Access denied" }, 403);

    // SECURITY GUARD: the target account must be one that is *currently in
    // onboarding*. Without this a permitted caller could request a recovery
    // link for ANY account (e.g. an admin's) and have it mailed to an inbox
    // they control — account takeover. An admin/dev/staff account is never
    // in_onboarding_mode, so this ties the invite to genuine new starters only.
    const { data: targetProfile, error: targetErr } = await supabase
      .from("profiles")
      .select("id, in_onboarding_mode, in_trial_mode")
      .ilike("email", company_email)
      .maybeSingle();
    if (targetErr) return json({ error: "Could not verify the target account" }, 500);
    if (!targetProfile) {
      return json({ error: "No account found for that company email — provision it first" }, 404);
    }
    // Trial Day (15 Sep): a trialist login is contained the same way, so it
    // may receive the same one-shot set-password invite. Nothing else can.
    if (targetProfile.in_onboarding_mode !== true && targetProfile.in_trial_mode !== true) {
      return json({ error: "That account is not in onboarding or on trial — invites are for new starters only" }, 409);
    }

    // One-shot set-password token for the company account. "recovery" is the
    // type that works for an already-created, already-confirmed user (invite/
    // signup types reject existing accounts). We take only the hashed token —
    // Supabase never emails anything, and we never log it.
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: company_email,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("[onboarding-invite] generateLink failed");
      return json(
        { error: "Couldn't generate the invite link — has the login been provisioned?" },
        422
      );
    }

    // Fragment, not query string: fragments never reach server logs.
    const inviteUrl =
      `${APP_ORIGIN}/welcome` +
      `#token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
      `&email=${encodeURIComponent(company_email)}`;

    const send = await sendResendEmail(
      company_email,
      isTrial
        ? "Your Meridian trial-day login — set your password"
        : "Your Vexon OS account is ready — set your password",
      isTrial
        ? trialInviteEmailHtml({
            fullName: typeof full_name === "string" ? full_name : "",
            email: company_email,
            inviteUrl,
          })
        : inviteEmailHtml({
            fullName: typeof full_name === "string" ? full_name : "",
            companyEmail: company_email,
            inviteUrl,
          })
    );
    if (!send.ok) {
      // Non-fatal for the provisioning flow: the account exists, the caller
      // shows the credentials fallback. Distinct message per cause.
      console.error("[onboarding-invite] send failed:", send.attempted ? "provider rejected" : "not configured");
      return json(
        {
          error: send.attempted
            ? "The invite email was rejected by the email provider"
            : "Email sending isn't configured (RESEND_API_KEY)",
        },
        502
      );
    }

    return json({ success: true, invite_sent: true });
  } catch (e) {
    console.error("[onboarding-invite]", e instanceof Error ? e.message : "unexpected error");
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
